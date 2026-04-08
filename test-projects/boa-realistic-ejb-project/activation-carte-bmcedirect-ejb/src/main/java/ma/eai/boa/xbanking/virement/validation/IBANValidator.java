package ma.eai.boa.xbanking.virement.validation;
import javax.validation.ConstraintValidator; import javax.validation.ConstraintValidatorContext;
public class IBANValidator implements ConstraintValidator<ValidIBAN, String> {
    @Override public boolean isValid(String v, ConstraintValidatorContext c) {
        if (v == null) return true;
        return v.matches("^[A-Z]{2}\\d{2}[A-Z0-9]{10,30}$");
    }
}
