package ma.eai.midw.annotations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation marqueur pour les classes UseCase du framework EAI.
 * Equivalent fonctionnel de @Stateless pour le pattern BaseUseCase.
 *
 * @author Framework EAI — Direction SI BOA
 * @since 2019
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface UseCase {
    String value() default "";
    String description() default "";
}
