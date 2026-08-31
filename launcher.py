"""
IMPORTS
"""
from http.server import SimpleHTTPRequestHandler, HTTPServer
import webbrowser
import os

"""
SETTINGS
"""

NAME = "localhost"
PORT = 8080
DIRECTORY = os.getcwd()

"""
REQUEST HANDLER
"""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Local dev server only: disable caching so edits show up on a plain
        # reload instead of requiring a hard refresh or server restart.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

"""
START APP
"""

if __name__ == "__main__":
    webServer = HTTPServer((NAME, PORT), Handler)
    print("Server started http://%s:%s" % (NAME, PORT))

    try:
        webbrowser.open('http://localhost:8080', new=2)
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
