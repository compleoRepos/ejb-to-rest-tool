package ma.eai.boa.xbanking.virement.validation;
import javax.validation.Constraint; import javax.validation.Payload; import java.lang.annotation.*;
@Documented @Constraint(validatedBy = RIBValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER}) @Retention(RetentionPolicy.RUNTIME)
public @interface ValidRIB {
    String message() default "RIB invalide (24 caracteres attendus)";
    Class<?>[] groups() default {}; Class<? extends Payload>[] payload() default {};
}
