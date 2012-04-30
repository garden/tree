// Demo code.

type foo<T> = int;
enum bar {
    some(int, foo<float>),
    none
}

fn check_crate(x: int) {
    let v = 10;
    alt foo {
      1 to 3 {
        print_foo();
        if x {
            blah() + 10;
        }
      }
      (x, y) { "bye" }
      _ { "hi" }
    }
}

