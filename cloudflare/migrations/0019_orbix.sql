-- OrbixPlay: ID del dispositivo nell'app OrbixPlay e playlist inviate ({"id":"...","pls":["..."],"t":...})
ALTER TABLE devices ADD COLUMN orbix TEXT NOT NULL DEFAULT '';
