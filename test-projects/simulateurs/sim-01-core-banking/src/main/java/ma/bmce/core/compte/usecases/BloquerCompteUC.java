package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.ConsulterSoldeVoIn;
import ma.bmce.core.compte.dto.ConsulterSoldeVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;

import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

@Stateless
public class BloquerCompteUC extends BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {

    @Resource(name = "jdbc/BMCE_CORE_DS")
    private DataSource dataSource;

    @Override
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT005", "Blocage du compte " + voIn.getNumCompte());

        try {
            Connection conn = dataSource.getConnection();
            Statement stmt = conn.createStatement();

            // SEC-001: SQL INJECTION VULNERABILITY — string concatenation!
            String query = "UPDATE T_COMPTES SET STATUT = 'BLOQUE' " +
                          "WHERE NUM_COMPTE = '" + voIn.getNumCompte() + "'";
            stmt.executeUpdate(query);

            EaiLog.info("CPT005", "Compte bloqué: " + voIn.getNumCompte());
        } catch (Exception e) {
            throw new FwkRollbackException("CPT005_ERR", "Erreur blocage: " + e.getMessage());
        }

        return new ConsulterSoldeVoOut();
    }
}
