package ma.eai.boa.xbanking.carte.validation;

import javax.validation.Constraint;
import javax.validation.Payload;
import java.lang.annotation.*;

@Documented
@Constraint(validatedBy = NumCarteValidator.class)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidNumCarte {
    String message() default "Numero de carte invalide (doit contenir 16 chiffres)";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
