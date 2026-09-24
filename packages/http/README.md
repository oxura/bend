# HTTP and HTTPS for Bend

Import `./http.bend as H` from a Bend program. This module adds a bounded
`H.HTTP.request(method, url, headers, body, max_output, timeout_ms, ca_file)`
effect; it does not modify `Base` or the Bend linker. `Done{H.Response{status,
headers, body}}` is a completed transfer even for HTTP 4xx/5xx. `Fail`
reports transport and input errors. The byte cap applies to the combined
response headers and body; redirects are disabled and only HTTP(S) URLs are
accepted. A nonempty `ca_file` selects a trust anchor, while an empty one uses
the system trust store. Certificate and hostname verification are always on.

```bend
import Base
import ./http.bend as H

def main() -> IO(Unit):
  do IO<Unit>:
    response : H.HTTP.Response <- IO.try(H.HTTP.Response,
      H.HTTP.request("GET", "https://example.com/", [], "", 32768, 5000, ""))
    match response:
      case H.Response{status, headers, body}:
        IO.print(U32.show(status) ++ "\n" ++ body)
```

Native builds require libcurl development headers and load `libcurl.so.4`
(Linux) or `libcurl.dylib` (macOS) at runtime; no `-lcurl` linker option is
needed. The JS lane uses Bun FFI. Native transfers run on IO helper threads;
JS transfers block its event loop. Missing libcurl returns error code 2. This
package handles HTTPS requests; it does not expose a raw TLS byte stream.

`bun bend2/main.ts packages/http/test.bend --checkup` runs the deterministic
input-validation fixture. The package is licensed Apache-2.0 (`LICENSE`).
