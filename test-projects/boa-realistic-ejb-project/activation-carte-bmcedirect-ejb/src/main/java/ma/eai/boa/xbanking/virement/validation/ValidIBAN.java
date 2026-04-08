package ma.eai.boa.xbanking.virement.validation;
import javax.validation.Constraint; import javax.validation.Payload; import java.lang.annotation.*;
@Documented @Constraint(validatedBy = IBANValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER}) @Retention(RetentionPolicy.RUNTIME)
public @interface ValidIBAN {
    String message() default "IBAN invalide";
    Class<?>[] groups() default {}; Class<? extends Payload>[] payload() default {};
}
