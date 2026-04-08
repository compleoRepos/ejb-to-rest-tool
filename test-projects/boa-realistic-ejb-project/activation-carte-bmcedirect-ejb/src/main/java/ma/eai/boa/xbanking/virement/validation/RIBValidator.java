package ma.eai.boa.xbanking.virement.validation;
import javax.validation.ConstraintValidator; import javax.validation.ConstraintValidatorContext;
public class RIBValidator implements ConstraintValidator<ValidRIB, String> {
    @Override public boolean isValid(String v, ConstraintValidatorContext c) {
        if (v == null) return true;
        return v.matches("\\d{24}");
    }
}
