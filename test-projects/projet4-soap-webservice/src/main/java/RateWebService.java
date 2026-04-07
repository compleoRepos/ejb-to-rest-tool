package com.bank.soap.ws;

import com.bank.soap.dto.RateResponseDTO;
import com.bank.soap.exception.ServiceFault;
import com.bank.soap.exception.ServiceFaultException;
import com.bank.soap.model.ExchangeRate;
import com.bank.soap.util.SoapHelper;

import javax.jws.WebMethod;
import javax.jws.WebParam;
import javax.jws.WebResult;
import javax.jws.WebService;
import javax.jws.soap.SOAPBinding;
import java.math.BigDecimal;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * Service Web SOAP pour les taux de change.
 * Fournit les taux de change entre différentes devises.
 *
 * @author Hamza NORDINE
 */
@WebService(serviceName = "RateService")
@SOAPBinding(style = SOAPBinding.Style.DOCUMENT, use = SOAPBinding.Use.LITERAL)
public class RateWebService {

    private static final Map<String, ExchangeRate> rates = new HashMap<>();

    static {
        rates.put("USD-EUR", new ExchangeRate("USD", "EUR", new BigDecimal("0.92")));
        rates.put("EUR-USD", new ExchangeRate("EUR", "USD", new BigDecimal("1.08")));
        rates.put("USD-GBP", new ExchangeRate("USD", "GBP", new BigDecimal("0.79")));
        rates.put("GBP-USD", new ExchangeRate("GBP", "USD", new BigDecimal("1.27")));
    }

    /**
     * Récupère le taux de change entre deux devises.
     *
     * @param fromCurrency la devise d'origine
     * @param toCurrency   la devise de destination
     * @return le taux de change
     * @throws ServiceFaultException si les devises ne sont pas valides ou si le taux n'est pas disponible
     */
    @WebMethod
    @WebResult(name = "exchangeRate")
    public RateResponseDTO getExchangeRate(
            @WebParam(name = "fromCurrency") String fromCurrency,
            @WebParam(name = "toCurrency") String toCurrency) throws ServiceFaultException {

        SoapHelper.validateNotEmpty(fromCurrency, "From currency cannot be empty");
        SoapHelper.validateNotEmpty(toCurrency, "To currency cannot be empty");

        if (fromCurrency.equals(toCurrency)) {
            return new RateResponseDTO(fromCurrency, toCurrency, BigDecimal.ONE, new Date());
        }

        String rateKey = fromCurrency.toUpperCase() + "-" + toCurrency.toUpperCase();
        ExchangeRate rate = rates.get(rateKey);

        if (rate == null) {
            throw new ServiceFaultException("Exchange rate not found", new ServiceFault("E404", "Exchange rate for " + rateKey + " not available."));
        }

        return new RateResponseDTO(rate.getFromCurrency(), rate.getToCurrency(), rate.getRate(), rate.getLastUpdated());
    }
}
