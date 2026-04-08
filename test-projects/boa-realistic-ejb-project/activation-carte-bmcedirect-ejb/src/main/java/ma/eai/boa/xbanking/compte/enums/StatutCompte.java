package ma.eai.boa.xbanking.compte.enums;
import javax.xml.bind.annotation.*;
@XmlType @XmlEnum
public enum StatutCompte { OUVERT, BLOQUE, CLOTURE, DORMANT, SAISI; }
