import UIKit
import WebKit

/// Serve l'interfaccia (www/index.html + config.js) dall'app con l'indirizzo kairos://app/
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let reqUrl = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var name = reqUrl.path
        if name.hasPrefix("/") { name.removeFirst() }
        if name.isEmpty { name = "index.html" }
        guard !name.contains(".."),
              let file = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "www"),
              let data = try? Data(contentsOf: file) else { return task.didFailWithError(URLError(.fileDoesNotExist)) }
        let mime = name.hasSuffix(".js") ? "text/javascript" : name.hasSuffix(".html") ? "text/html" : name.hasSuffix(".png") ? "image/png" : "application/octet-stream"
        let res = HTTPURLResponse(url: reqUrl, statusCode: 200, httpVersion: "HTTP/1.1",
                                  headerFields: ["Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-cache"])!
        task.didReceive(res)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Inoltra i messaggi della pagina senza trattenere il controller (evita il ciclo con WKUserContentController)
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(c, didReceive: m) }
}

func jsString(_ s: String) -> String {
    guard let d = try? JSONEncoder().encode(s), let out = String(data: d, encoding: .utf8) else { return "\"\"" }
    return out
}

/// La stessa interfaccia di Kairos Pro per Android, con il ponte «KairosNative» per il player nativo e le richieste HTTP
final class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.httpMaximumConnectionsPerHost = 6
        return URLSession(configuration: c)
    }()

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: "kairos")
        let ucc = WKUserContentController()
        ucc.add(WeakHandler(self), name: "kx")
        ucc.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.userContentController = ucc
        web = WKWebView(frame: .zero, configuration: cfg)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: URL(string: "kairos://app/index.html")!))
    }

    private func bridgeScript() -> String {
        let info = Bundle.main.infoDictionary ?? [:]
        let ver = info["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let code = Int(info["CFBundleVersion"] as? String ?? "1") ?? 1
        let model = "Apple " + UIDevice.current.model + " iOS " + UIDevice.current.systemVersion
        return """
        (function(){
          var post = function(m, a){ try { window.webkit.messageHandlers.kx.postMessage({ m: m, a: a }); } catch (e) {} };
          window.KairosNative = {
            version: function(){ return \(jsString(ver)); },
            versionCode: function(){ return \(code); },
            model: function(){ return \(jsString(model)); },
            isTv: function(){ return false; },
            uiReady: function(){}, uiVersion: function(){ return ''; }, uiBad: function(){ return ''; },
            playStats: function(){ return '{}'; }, playEvents: function(){ return '[]'; }, netInfo: function(){ return '{}'; },
            exit: function(){},
            setOrientation: function(m){},
            openUrl: function(u){ post('openUrl', [String(u)]); },
            playYoutube: function(id, t){ post('openUrl', ['https://www.youtube.com/watch?v=' + encodeURIComponent(id)]); },
            http: function(id, m, u, b, ua){ post('http', [String(id), String(m), String(u), String(b || ''), String(ua || '')]); },
            play: function(j){ post('play', [String(j)]); },
            playerClose: function(){ post('playerClose', []); }
          };
        })();
        """
    }

    func js(_ code: String) { DispatchQueue.main.async { self.web.evaluateJavaScript(code, completionHandler: nil) } }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any], let m = d["m"] as? String else { return }
        let a = (d["a"] as? [Any] ?? []).map { "\($0)" }
        switch m {
        case "http": if a.count >= 5 { http(id: a[0], method: a[1], url: a[2], body: a[3], ua: a[4]) }
        case "play": play(a.first ?? "")
        case "playerClose": (presentedViewController as? PlayerViewController)?.close()
        case "openUrl": if let u = URL(string: a.first ?? "") { UIApplication.shared.open(u) }
        default: break
        }
    }

    private func http(id: String, method: String, url: String, body: String, ua: String) {
        guard let u = URL(string: url) else { return js("window.kxHttpCb && kxHttpCb(\(jsString(id)), -1, '')") }
        var r = URLRequest(url: u)
        r.httpMethod = method == "POST" ? "POST" : "GET"
        r.setValue(ua.isEmpty ? "KairosPlayer/iOS" : ua, forHTTPHeaderField: "User-Agent")
        r.setValue("application/json, text/plain, */*", forHTTPHeaderField: "Accept")
        if method == "POST" { r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.httpBody = body.data(using: .utf8) }
        session.dataTask(with: r) { [weak self] data, res, _ in
            let status = (res as? HTTPURLResponse)?.statusCode ?? -1
            let text = data.flatMap { String(data: $0, encoding: .utf8) ?? String(data: $0, encoding: .isoLatin1) } ?? ""
            self?.js("window.kxHttpCb && kxHttpCb(\(jsString(id)), \(status), \(jsString(text)))")
        }.resume()
    }

    private func play(_ payload: String) {
        guard let data = payload.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        DispatchQueue.main.async {
            self.presentedViewController?.dismiss(animated: false)
            let p = PlayerViewController(json: j)
            p.onClose = { [weak self] result in self?.js("window.kxPlayerClosed && window.kxPlayerClosed(\(jsString(result)))") }
            self.present(p, animated: false)
        }
    }

    // link esterni (es. target=_blank) nel browser di sistema
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { UIApplication.shared.open(u) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = navigationAction.request.url, let s = u.scheme?.lowercased() else { return decisionHandler(.allow) }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? false
        if ["kairos", "about", "blob", "data"].contains(s) || !mainFrame || navigationAction.navigationType != .linkActivated {
            return decisionHandler(.allow)
        }
        UIApplication.shared.open(u)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Annulla", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }
}
