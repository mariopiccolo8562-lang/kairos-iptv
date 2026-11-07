import UIKit
import MobileVLCKit

/// Player nativo a schermo intero (VLC): legge m3u8, .ts, mp4, mkv… come ExoPlayer/mpv su Android
final class PlayerViewController: UIViewController, VLCMediaPlayerDelegate {
    private struct Item { let id: String; let title: String; let url: String }

    var onClose: ((String) -> Void)?
    private let kind: String
    private let items: [Item]
    private var index: Int
    private var startMs: Int32
    private let player = VLCMediaPlayer()
    private let video = UIView()
    private let overlay = UIView()
    private let titleL = UILabel()
    private let timeL = UILabel()
    private let errL = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let slider = UISlider()
    private let playB = UIButton(type: .system)
    private let prevB = UIButton(type: .system)
    private let nextB = UIButton(type: .system)
    private let closeB = UIButton(type: .system)
    private var hideWork: DispatchWorkItem?
    private var seeking = false
    private var started = false
    private var closed = false

    private var isLive: Bool { kind == "live" }
    private var item: Item { items[max(0, min(index, items.count - 1))] }

    init(json j: [String: Any]) {
        kind = j["kind"] as? String ?? "live"
        items = (j["items"] as? [[String: Any]] ?? []).map {
            Item(id: "\($0["id"] ?? "")", title: $0["t"] as? String ?? "", url: $0["u"] as? String ?? "")
        }
        index = j["index"] as? Int ?? 0
        startMs = Int32(clamping: (j["start"] as? NSNumber)?.int64Value ?? 0)
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError() }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        video.frame = view.bounds
        video.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(video)
        player.drawable = video
        player.delegate = self

        spinner.color = .white
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)
        errL.textColor = .white
        errL.numberOfLines = 0
        errL.textAlignment = .center
        errL.font = .systemFont(ofSize: 16, weight: .semibold)
        errL.isHidden = true
        errL.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errL)

        overlay.frame = view.bounds
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        view.addSubview(overlay)
        titleL.textColor = .white
        titleL.font = .systemFont(ofSize: 18, weight: .bold)
        timeL.textColor = UIColor.white.withAlphaComponent(0.85)
        timeL.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium)
        let cfg = UIImage.SymbolConfiguration(pointSize: 30, weight: .bold)
        func setup(_ b: UIButton, _ sym: String, _ sel: Selector) {
            b.setImage(UIImage(systemName: sym, withConfiguration: cfg), for: .normal)
            b.tintColor = .white
            b.addTarget(self, action: sel, for: .touchUpInside)
        }
        setup(closeB, "xmark", #selector(close))
        setup(playB, "pause.fill", #selector(togglePlay))
        setup(prevB, isLive ? "chevron.up" : "backward.end.fill", #selector(prev))
        setup(nextB, isLive ? "chevron.down" : "forward.end.fill", #selector(next))
        slider.minimumTrackTintColor = .white
        slider.addTarget(self, action: #selector(seekBegin), for: .touchDown)
        slider.addTarget(self, action: #selector(seekEnd), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        let center = UIStackView(arrangedSubviews: [prevB, playB, nextB])
        center.spacing = 56
        for v in [titleL, timeL, closeB, center, slider] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false; overlay.addSubview(v) }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor), spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            errL.centerXAnchor.constraint(equalTo: view.centerXAnchor), errL.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: 60),
            errL.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.8),
            closeB.topAnchor.constraint(equalTo: g.topAnchor, constant: 16), closeB.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -20),
            titleL.centerYAnchor.constraint(equalTo: closeB.centerYAnchor), titleL.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 20),
            titleL.trailingAnchor.constraint(lessThanOrEqualTo: closeB.leadingAnchor, constant: -16),
            center.centerXAnchor.constraint(equalTo: view.centerXAnchor), center.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            slider.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 20), slider.trailingAnchor.constraint(equalTo: timeL.leadingAnchor, constant: -12),
            slider.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            timeL.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -20), timeL.centerYAnchor.constraint(equalTo: slider.centerYAnchor),
        ])
        slider.isHidden = isLive
        prevB.isHidden = items.count < 2
        nextB.isHidden = items.count < 2

        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggleOverlay)))
        if isLive {
            let up = UISwipeGestureRecognizer(target: self, action: #selector(next)); up.direction = .up
            let down = UISwipeGestureRecognizer(target: self, action: #selector(prev)); down.direction = .down
            view.addGestureRecognizer(up); view.addGestureRecognizer(down)
        }
        load()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if !closed { finish() }
    }

    private func load() {
        errL.isHidden = true
        started = false
        titleL.text = item.title
        guard let u = URL(string: item.url) else { return fail() }
        let m = VLCMedia(url: u)
        m.addOptions(["network-caching": isLive ? 2000 : 3000, "http-reconnect": true, "http-user-agent": "KairosPlayer/iOS"])
        player.media = m
        player.play()
        spinner.startAnimating()
        showOverlay()
    }

    private func fail() {
        spinner.stopAnimating()
        errL.text = "Impossibile riprodurre «\(item.title)».\nControlla la linea o riprova."
        errL.isHidden = false
        showOverlay(autoHide: false)
    }

    func mediaPlayerStateChanged(_ n: Notification) {
        switch player.state {
        case .opening, .buffering: if !player.isPlaying { spinner.startAnimating() }
        case .playing:
            spinner.stopAnimating()
            playB.setImage(UIImage(systemName: "pause.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 30, weight: .bold)), for: .normal)
            if !started { started = true; if !isLive && startMs > 5000 { player.time = VLCTime(int: startMs); startMs = 0 } }
        case .paused:
            playB.setImage(UIImage(systemName: "play.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 30, weight: .bold)), for: .normal)
        case .error: fail()
        case .ended, .stopped:
            spinner.stopAnimating()
            if !isLive && started && index + 1 < items.count { next() }
        default: break
        }
    }

    func mediaPlayerTimeChanged(_ n: Notification) {
        if spinner.isAnimating { spinner.stopAnimating() }
        guard !isLive else { return }
        let t = Int(player.time.intValue), d = Int(player.media?.length.intValue ?? 0)
        if !seeking && d > 0 { slider.value = Float(t) / Float(d) }
        timeL.text = "\(fmt(t / 1000)) / \(fmt(d / 1000))"
    }

    private func fmt(_ s: Int) -> String { s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60) }

    @objc private func togglePlay() { player.isPlaying ? player.pause() : player.play(); showOverlay() }
    @objc private func prev() { guard items.count > 1 else { return }; index = (index - 1 + items.count) % items.count; startMs = 0; load() }
    @objc private func next() { guard items.count > 1 else { return }; index = (index + 1) % items.count; startMs = 0; load() }
    @objc private func seekBegin() { seeking = true; hideWork?.cancel() }
    @objc private func seekEnd() {
        seeking = false
        let d = player.media?.length.intValue ?? 0
        if d > 0 { player.time = VLCTime(int: Int32(Float(d) * slider.value)) }
        showOverlay()
    }
    @objc private func toggleOverlay() { overlay.alpha > 0.5 ? hideOverlay() : showOverlay() }
    private func showOverlay(autoHide: Bool = true) {
        UIView.animate(withDuration: 0.2) { self.overlay.alpha = 1 }
        hideWork?.cancel()
        guard autoHide else { return }
        let w = DispatchWorkItem { [weak self] in self?.hideOverlay() }
        hideWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: w)
    }
    private func hideOverlay() { if errL.isHidden { UIView.animate(withDuration: 0.25) { self.overlay.alpha = 0 } } }

    private func finish() {
        guard !closed else { return }
        closed = true
        let r: [String: Any] = ["kind": kind, "id": item.id, "pos": Int(player.time.intValue) / 1000,
                                "dur": Int(player.media?.length.intValue ?? 0) / 1000, "height": Int(player.videoSize.height)]
        player.stop()
        let s = (try? JSONSerialization.data(withJSONObject: r)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        onClose?(s)
    }

    @objc func close() {
        finish()
        dismiss(animated: false)
    }
}
