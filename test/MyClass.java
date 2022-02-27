package test;

@ClassAnnotation1("hello")
@ClassAnnotation2(value = 1, text = "" + "", obj = @Complex())
class MyClass {
    @Annotation1
    public Map<@NotNull String, String> method1(int x) {}

    public void method2(String a, @A @B(1.0) List<@Null String> b) {}
}
