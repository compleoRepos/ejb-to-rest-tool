package ma.eai.boa.xbanking.carte.enums;

import javax.xml.bind.annotation.*;

@XmlType(name = "MotifBlocage")
@XmlEnum
public enum MotifBlocage {
    VOL_DECLARE, PERTE_DECLAREE, FRAUDE_SUSPECTEE,
    OPPOSITION_ADMINISTRATIVE, DEMANDE_CLIENT, IMPAYE,
    DEPASSEMENT_PLAFOND, COMPTE_BLOQUE;
}
