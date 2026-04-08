package ma.bmce.batch.releves;

import javax.batch.api.chunk.ItemReader;
import java.io.Serializable;

public class CompteActifReader implements ItemReader {
    @Override
    public void open(Serializable checkpoint) throws Exception {}
    @Override
    public Object readItem() throws Exception { return null; }
    @Override
    public void close() throws Exception {}
    @Override
    public Serializable checkpointInfo() throws Exception { return null; }
}
