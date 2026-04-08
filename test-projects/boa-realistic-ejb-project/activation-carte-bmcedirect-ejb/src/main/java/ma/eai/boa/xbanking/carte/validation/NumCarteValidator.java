package ma.eai.boa.xbanking.carte.validation;

import javax.validation.ConstraintValidator;
import javax.validation.ConstraintValidatorContext;

public class NumCarteValidator implements ConstraintValidator<ValidNumCarte, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true;
        return value.matches("\\d{16}");
    }
}
