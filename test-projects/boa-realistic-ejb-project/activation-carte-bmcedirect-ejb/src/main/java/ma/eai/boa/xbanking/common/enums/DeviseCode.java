package ma.eai.boa.xbanking.common.enums;

import javax.xml.bind.annotation.XmlEnum;
import javax.xml.bind.annotation.XmlType;

@XmlType(name = "DeviseCode")
@XmlEnum
public enum DeviseCode {
    MAD, EUR, USD, GBP, XOF, XAF;
}
