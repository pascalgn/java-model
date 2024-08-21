package test;

import java.util.Map;
import test.annotate.*;

@ClassAnnotation1("hello")
@ClassAnnotation2(value = 1, text = "" + "", obj = @Complex())
abstract class MyClass {
    @interface Annotation1 {
		String value() default "";
	}

    @Annotation1
    abstract Map<@NotNull String, String> method1(int x);

    @Annotation2(test = @Annotation3({ 123, 456 }))
    abstract void method2(final String a, @A @B(1.0) List<@Null String> b);

    protected class InnerClass1<T1> {
        class InnerClass2<T2 extends T1 & Serializable> {
            private T2 field2;
        }

        interface InnerInterface {
            Long value();
        }

        private T1 field1;
    }

    abstract InnerClass1<String>.InnerClass2<Number> method3();

    public record Record1(int i, String s) {
    }

    public Record1 method4() {
        return null;
    }

    public enum Enum1 { A, B }

    private final List<Map<Set<Integer>, List<Double>>> field1;
    private Set<? extends List<?>> field2 = new java.util.HashSet<>(100, 0.5f);

    private long[][] field3a;
    private Long[][] field3b;
    private List<String>[][] field4;

    private int field5 = (-0x100);
}
