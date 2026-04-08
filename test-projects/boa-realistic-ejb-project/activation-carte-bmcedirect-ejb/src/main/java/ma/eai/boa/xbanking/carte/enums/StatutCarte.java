package ma.eai.boa.xbanking.carte.enums;

import javax.xml.bind.annotation.*;

@XmlType(name = "StatutCarte")
@XmlEnum
public enum StatutCarte {
    @XmlEnumValue("NON_ACTIVEE") NON_ACTIVEE,
    @XmlEnumValue("ACTIVE") ACTIVE,
    @XmlEnumValue("BLOQUEE") BLOQUEE,
    @XmlEnumValue("OPPOSITION") OPPOSITION,
    @XmlEnumValue("EXPIREE") EXPIREE,
    @XmlEnumValue("ANNULEE") ANNULEE;
}
