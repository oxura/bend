# JSON for Bend

Import `./json.bend as J` from another Bend file. After publishing, use the
content hash in place of the relative path. This package imports `Base` but does
not change it.

`J.JSON.read(text)` returns `Result<&1, &1, U32 & String, J.JSON>`; failures
contain a character offset and message. `J.JSON.write(value)` returns the same
result type with a `String` on success. Numbers retain their original decimal
lexemes. Encoding validates number lexemes and object members; it escapes
strings. For example:

```bend
import Base
import ./json.bend as J

def main() -> IO(Unit):
  do IO<Unit>:
    text : String <- IO.pass(String, J.JSON.write(
      J.Obj{[J.Member{"hello", J.Str{"Привет"}}]}))
    IO.print(text)
```

`J.JSON.write` uses an `@unsafe` worklist because Bend does not prove its
termination; a proof-dependency check will report that fact. The parser derives
from H4ad/bend-stdlib's Apache-2.0 JSON module; the header in `json.bend` lists
the changes, and `LICENSE` retains the Apache-2.0 terms.

Run `bun bend2/main.ts packages/json/test.bend --checkup` from the Bend checkout
to exercise parsing, round trips, invalid input, and malformed values.
