package ma.bmce.batch.virements;

import javax.batch.api.chunk.ItemWriter;
import java.util.List;

public class VirementWriter implements ItemWriter {
    @Override
    public void open(java.io.Serializable checkpoint) throws Exception {}
    @Override
    public void close() throws Exception {}
    @Override
    public void writeItems(List<Object> items) throws Exception {
        // Mise à jour statut des virements
    }
    @Override
    public java.io.Serializable checkpointInfo() throws Exception { return null; }
}
