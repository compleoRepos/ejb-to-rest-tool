package ma.bmce.batch.interets;

import javax.batch.api.chunk.ItemWriter;
import java.util.List;

// Pattern F: Pas de @Transactional sur le batch writer — TRX-001
public class InteretWriter implements ItemWriter {

    @Override
    public void open(java.io.Serializable checkpoint) throws Exception {}

    @Override
    public void close() throws Exception {}

    // Pas de @Transactional !
    @Override
    public void writeItems(List<Object> items) throws Exception {
        for (Object item : items) {
            // INSERT INTO T_INTERETS (...)
            // Appel Magix MAJ001
        }
    }

    @Override
    public java.io.Serializable checkpointInfo() throws Exception {
        return null;
    }
}
