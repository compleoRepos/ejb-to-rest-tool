package ma.eai.boa.xbanking.carte.enums;

import javax.xml.bind.annotation.*;

@XmlType(name = "TypeCarte")
@XmlEnum
public enum TypeCarte {
    @XmlEnumValue("VISA_CLASSIC") VISA_CLASSIC,
    @XmlEnumValue("VISA_GOLD") VISA_GOLD,
    @XmlEnumValue("VISA_PLATINUM") VISA_PLATINUM,
    @XmlEnumValue("MASTERCARD") MASTERCARD,
    @XmlEnumValue("MASTERCARD_GOLD") MASTERCARD_GOLD,
    @XmlEnumValue("CARTE_PREPAYEE") CARTE_PREPAYEE;
}
