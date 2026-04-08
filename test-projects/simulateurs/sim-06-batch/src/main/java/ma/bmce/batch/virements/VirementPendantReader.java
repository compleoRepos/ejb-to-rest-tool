package ma.bmce.batch.virements;

import javax.batch.api.chunk.ItemReader;
import javax.annotation.Resource;
import javax.sql.DataSource;
import java.io.Serializable;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

public class VirementPendantReader implements ItemReader {

    @Resource(name = "jdbc/BMCE_CORE_DS")
    private DataSource dataSource;

    @Override
    public void open(Serializable checkpoint) throws Exception {
        Connection conn = dataSource.getConnection();
        Statement stmt = conn.createStatement();

        // Pattern E: ResultSet non fermé — JDBC-001 CRITICAL
        ResultSet rs = stmt.executeQuery(
            "SELECT * FROM T_VIREMENTS WHERE STATUT = 'EN_ATTENTE' " +
            "AND DATE_EXECUTION <= CURRENT_DATE"
        );
        // Pas de try-with-resources, pas de finally rs.close()
    }

    @Override
    public Object readItem() throws Exception {
        return null;
    }

    @Override
    public void close() throws Exception {}

    @Override
    public Serializable checkpointInfo() throws Exception {
        return null;
    }
}
