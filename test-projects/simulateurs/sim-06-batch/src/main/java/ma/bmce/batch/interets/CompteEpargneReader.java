package ma.bmce.batch.interets;

import javax.batch.api.chunk.ItemReader;
import javax.annotation.Resource;
import javax.sql.DataSource;
import java.io.Serializable;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

public class CompteEpargneReader implements ItemReader {

    @Resource(name = "jdbc/BMCE_CORE_DS")
    private DataSource dataSource;

    private Connection conn;
    private ResultSet rs;

    @Override
    public void open(Serializable checkpoint) throws Exception {
        conn = dataSource.getConnection();
        Statement stmt = conn.createStatement();
        rs = stmt.executeQuery(
            "SELECT * FROM T_COMPTES WHERE TYPE = 'EPARGNE' AND STATUT = 'ACTIF'"
        );
    }

    @Override
    public Object readItem() throws Exception {
        if (rs.next()) {
            return rs;
        }
        return null;
    }

    @Override
    public void close() throws Exception {
        // Connection fermée ici mais pas le ResultSet
    }

    @Override
    public Serializable checkpointInfo() throws Exception {
        return null;
    }
}
