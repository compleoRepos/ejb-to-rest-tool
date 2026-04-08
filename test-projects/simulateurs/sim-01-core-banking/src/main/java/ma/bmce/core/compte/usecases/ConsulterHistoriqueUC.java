package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.ConsulterHistoriqueVoIn;
import ma.bmce.core.compte.dto.ConsulterHistoriqueVoOut;
import ma.bmce.core.compte.dto.OperationDto;
import ma.bmce.core.compte.enums.SensOperation;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;

import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Stateless
public class ConsulterHistoriqueUC extends BaseUseCase<ConsulterHistoriqueVoIn, ConsulterHistoriqueVoOut> {

    @Resource(name = "jdbc/BMCE_CORE_DS")
    private DataSource dataSource;

    @Override
    public ConsulterHistoriqueVoOut execute(ConsulterHistoriqueVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT004", "Consultation historique compte " + voIn.getNumCompte());

        List<OperationDto> operations = new ArrayList<>();

        try {
            // JDBC legacy héritage T24 — pas de try-with-resources
            Connection conn = dataSource.getConnection();
            PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM T_OPERATIONS WHERE NUM_COMPTE = ? " +
                "AND DATE_OPER BETWEEN ? AND ? " +
                "ORDER BY DATE_OPER DESC"
            );
            ps.setString(1, voIn.getNumCompte());
            ps.setDate(2, java.sql.Date.valueOf(voIn.getDateDebut()));
            ps.setDate(3, java.sql.Date.valueOf(voIn.getDateFin()));

            ResultSet rs = ps.executeQuery();
            while (rs.next()) {
                OperationDto op = new OperationDto();
                op.setReference(rs.getString("REFERENCE_OPE"));
                op.setDate(rs.getDate("DATE_OPERATION").toLocalDate());
                op.setLibelle(rs.getString("LIBELLE"));
                op.setMontant(rs.getBigDecimal("MONTANT"));
                op.setSens("D".equals(rs.getString("SENS")) ? SensOperation.DEBIT : SensOperation.CREDIT);
                op.setSoldeApres(rs.getBigDecimal("SOLDE_APRES"));
                operations.add(op);
            }
            // JDBC-001: Connection, PreparedStatement, ResultSet not closed!
            // No try-with-resources, no finally block

        } catch (Exception e) {
            throw new FwkRollbackException("CPT004_ERR", "Erreur consultation historique: " + e.getMessage());
        }

        ConsulterHistoriqueVoOut voOut = new ConsulterHistoriqueVoOut();
        voOut.setOperations(operations);
        voOut.setTotalElements((long) operations.size());
        return voOut;
    }
}
