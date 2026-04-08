package ma.eai.boa.xbanking.document.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class GenererDocumentVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private byte[] contenuDocument;
    @XmlElement private String nomFichier;
    @XmlElement private String contentType;
    @XmlElement private long tailleFichier;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public byte[] getContenuDocument() { return contenuDocument; } public void setContenuDocument(byte[] v) { this.contenuDocument = v; }
    public String getNomFichier() { return nomFichier; } public void setNomFichier(String v) { this.nomFichier = v; }
    public String getContentType() { return contentType; } public void setContentType(String v) { this.contentType = v; }
    public long getTailleFichier() { return tailleFichier; } public void setTailleFichier(long v) { this.tailleFichier = v; }
}
