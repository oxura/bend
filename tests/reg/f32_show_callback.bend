# F32.show must fit Base container renderers without an adapter lambda.
import Base

def main() -> IO(Unit):
  do IO<Unit>:
    Unit <- IO.print(List.show(~&2, ~F32, ~F32.show, [1.5, 2.5]))
    Unit <- IO.print(List.show(~&2, ~F32, ~F32.show, []))
    Unit <- IO.print(Maybe.show(~&2, ~F32, ~F32.show, Some{1.5}))
    IO.print(Maybe.show(~&2, ~F32, ~F32.show, None{}))

#|[1.5, 2.5]
#|[]
#|Some(1.5)
#|None
