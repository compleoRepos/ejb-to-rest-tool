package ma.eai.boa.xbanking.common.enums;

import javax.xml.bind.annotation.XmlEnum;
import javax.xml.bind.annotation.XmlEnumValue;
import javax.xml.bind.annotation.XmlType;

@XmlType(name = "Canal")
@XmlEnum
public enum Canal {
    @XmlEnumValue("BMCE_DIRECT") BMCE_DIRECT,
    @XmlEnumValue("MOBILE") MOBILE,
    @XmlEnumValue("AGENCE") AGENCE,
    @XmlEnumValue("GAB") GAB,
    @XmlEnumValue("TPE") TPE,
    @XmlEnumValue("API") API;
}
