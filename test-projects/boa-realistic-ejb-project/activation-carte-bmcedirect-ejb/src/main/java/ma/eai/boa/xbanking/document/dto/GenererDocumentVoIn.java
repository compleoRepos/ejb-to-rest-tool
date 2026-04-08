package ma.eai.boa.xbanking.document.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.virement.validation.ValidRIB;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class GenererDocumentVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @ValidRIB private String rib;
    @XmlElement(required = true) private String typeDocument;
    @XmlElement private String dateDebut;
    @XmlElement private String dateFin;
    @XmlElement private String format;
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getTypeDocument() { return typeDocument; } public void setTypeDocument(String v) { this.typeDocument = v; }
    public String getDateDebut() { return dateDebut; } public void setDateDebut(String v) { this.dateDebut = v; }
    public String getDateFin() { return dateFin; } public void setDateFin(String v) { this.dateFin = v; }
    public String getFormat() { return format; } public void setFormat(String v) { this.format = v; }
}
