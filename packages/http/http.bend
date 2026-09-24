# SPDX-License-Identifier: Apache-2.0
# Verified bounded HTTP(S) effect. Native builds load libcurl at runtime
# without changing Bend Base or its linker.
import Base

type HTTP.Header is Data:
  Header{name: String, value: String}

type HTTP.Response is Data:
  Response{status: U32, headers: List<&2, HTTP.Header>, body: String}

def HTTP.request(
  method: String, url: String, headers: List<&2, HTTP.Header>,
  body: String, max_output: U32, timeout_ms: U32, ca_file: String
) -> IO(Result<&1, &1, U32 & String, HTTP.Response>):
  import "./http.c"
  import "./http.js"
