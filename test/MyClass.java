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

    abstract void method2(final String a, @A @B(1.0) List<@Null String> b);

    protected class InnerClass1<T1> {
        class InnerClass2<T2 extends T1 & Serializable> {
            private T2 field2;
        }

        private T1 field1;
    }

    abstract InnerClass1<String>.InnerClass2<Number> method3();

    private final List<Map<Set<Integer>, List<Double>>> field1;
    private Set<? extends List<?>> field2;
}
