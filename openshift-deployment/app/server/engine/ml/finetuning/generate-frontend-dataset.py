#!/usr/bin/env python3
"""
generate-frontend-dataset.py -- Generateur de paires d'entrainement frontend.

Genere des paires (legacy JSP/Struts/Servlet → frontend moderne React/Angular/Vue)
pour enrichir le dataset de fine-tuning du modele ejb-modernizer.

Categories couvertes :
  - jsp_to_react : JSP avec scriptlets → composant React TypeScript
  - struts_to_react : Action Struts + JSP → composant React + service API
  - servlet_html_to_react : Servlet servant du HTML → composant React
  - jquery_ajax_to_react : JSP avec jQuery AJAX → composant React avec fetch/axios
  - jsf_to_react : JSF managed bean + xhtml → composant React
  - gwt_to_react : GWT RemoteService → composant React + API service
  - jsp_to_angular : JSP → composant Angular TypeScript
  - jsp_to_vue : JSP → composant Vue 3 SFC

@version v10.8
@author Compleo
"""

import json
import os
from datetime import datetime

SYSTEM_PROMPT = (
    "Tu es un expert en modernisation Java EE vers des architectures modernes. "
    "Tu transformes du code legacy (JSP, Struts, Servlets, JSF, GWT, jQuery) "
    "en composants frontend modernes (React, Angular, Vue) connectes a un backend Spring Boot. "
    "Le code genere doit compiler sans erreur, respecter les conventions du framework cible, "
    "et inclure des TODOs documentes (QUOI, POURQUOI, COMMENT) pour les parties a valider."
)

entries = []

# ============================================================================
# 1. JSP avec scriptlets → React TypeScript
# ============================================================================

JSP_EXAMPLES = [
    {
        "input": """<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<html>
<head><title>Liste des comptes</title></head>
<body>
<h1>Comptes clients</h1>
<table border="1">
  <tr><th>Numero</th><th>Nom</th><th>Solde</th><th>Actions</th></tr>
  <c:forEach var="compte" items="${comptes}">
    <tr>
      <td>${compte.numero}</td>
      <td>${compte.nomClient}</td>
      <td>${compte.solde}</td>
      <td><a href="compte?action=detail&id=${compte.id}">Voir</a></td>
    </tr>
  </c:forEach>
</table>
<a href="compte?action=nouveau">Nouveau compte</a>
</body>
</html>""",
        "output": """// AccountList.tsx -- Liste des comptes clients
// Migre depuis: comptes.jsp (JSP + JSTL forEach)
// TODO: [VALIDATION] Verifier que l'API /api/accounts retourne le meme format que l'ancien DAO
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { accountService } from '../services/accountService';

interface Account {
  id: number;
  numero: string;
  nomClient: string;
  solde: number;
}

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    accountService.getAll()
      .then(data => setAccounts(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-8"><span>Chargement...</span></div>;
  if (error) return <div className="text-red-600 p-4">Erreur: {error}</div>;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Comptes clients</h1>
        <Link to="/accounts/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Nouveau compte
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numero</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {accounts.map(compte => (
              <tr key={compte.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">{compte.numero}</td>
                <td className="px-6 py-4 whitespace-nowrap">{compte.nomClient}</td>
                <td className="px-6 py-4 whitespace-nowrap font-mono">
                  {compte.solde.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link to={`/accounts/${compte.id}`} className="text-blue-600 hover:underline">
                    Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}""",
        "category": "jsp_to_react",
    },
    {
        "input": """<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/fmt" prefix="fmt" %>
<html>
<head><title>Detail Transaction</title></head>
<body>
<h2>Transaction #${transaction.reference}</h2>
<div>
  <p>Date: <fmt:formatDate value="${transaction.dateOperation}" pattern="dd/MM/yyyy HH:mm"/></p>
  <p>Montant: <fmt:formatNumber value="${transaction.montant}" type="currency" currencyCode="EUR"/></p>
  <p>Type: ${transaction.type}</p>
  <p>Statut:
    <c:choose>
      <c:when test="${transaction.statut == 'VALIDEE'}"><span style="color:green">Validee</span></c:when>
      <c:when test="${transaction.statut == 'EN_ATTENTE'}"><span style="color:orange">En attente</span></c:when>
      <c:otherwise><span style="color:red">Rejetee</span></c:otherwise>
    </c:choose>
  </p>
  <p>Compte source: ${transaction.compteSource.numero}</p>
  <p>Compte destination: ${transaction.compteDest.numero}</p>
</div>
<a href="transactions">Retour a la liste</a>
</body>
</html>""",
        "output": """// TransactionDetail.tsx -- Detail d'une transaction
// Migre depuis: transaction-detail.jsp (JSP + JSTL fmt + c:choose)
// TODO: [VALIDATION] Verifier le mapping des statuts avec le backend
// TODO: [SECURITE] Ajouter verification que l'utilisateur a acces a cette transaction
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { transactionService } from '../services/transactionService';

interface Transaction {
  id: number;
  reference: string;
  dateOperation: string;
  montant: number;
  type: string;
  statut: 'VALIDEE' | 'EN_ATTENTE' | 'REJETEE';
  compteSource: { numero: string };
  compteDest: { numero: string };
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  VALIDEE: { label: 'Validee', className: 'text-green-600 bg-green-50 px-2 py-1 rounded' },
  EN_ATTENTE: { label: 'En attente', className: 'text-orange-600 bg-orange-50 px-2 py-1 rounded' },
  REJETEE: { label: 'Rejetee', className: 'text-red-600 bg-red-50 px-2 py-1 rounded' },
};

export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    transactionService.getById(Number(id))
      .then(data => setTransaction(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center">Chargement...</div>;
  if (!transaction) return <div className="p-8 text-center text-red-600">Transaction introuvable</div>;

  const statusConfig = STATUS_CONFIG[transaction.statut] || STATUS_CONFIG.REJETEE;

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Link to="/transactions" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Retour a la liste
      </Link>
      <h2 className="text-2xl font-bold mb-6">Transaction #{transaction.reference}</h2>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <InfoRow label="Date" value={new Date(transaction.dateOperation).toLocaleString('fr-FR')} />
        <InfoRow label="Montant" value={transaction.montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
        <InfoRow label="Type" value={transaction.type} />
        <div className="flex justify-between py-2 border-b">
          <span className="text-gray-500">Statut</span>
          <span className={statusConfig.className}>{statusConfig.label}</span>
        </div>
        <InfoRow label="Compte source" value={transaction.compteSource.numero} />
        <InfoRow label="Compte destination" value={transaction.compteDest.numero} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}""",
        "category": "jsp_to_react",
    },
]

for ex in JSP_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme ce code JSP legacy en composant React TypeScript moderne connecte a un backend Spring Boot REST:\n\n```jsp\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```tsx\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# 2. jQuery AJAX dans JSP → React avec fetch/axios
# ============================================================================

JQUERY_EXAMPLES = [
    {
        "input": """<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<html>
<head>
<title>Recherche Client</title>
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script>
$(document).ready(function() {
    $('#searchBtn').click(function() {
        var query = $('#searchInput').val();
        $.ajax({
            url: 'api/clients/search',
            type: 'GET',
            data: { q: query },
            dataType: 'json',
            success: function(data) {
                var html = '';
                $.each(data, function(i, client) {
                    html += '<tr><td>' + client.nom + '</td>';
                    html += '<td>' + client.email + '</td>';
                    html += '<td>' + client.telephone + '</td>';
                    html += '<td><button onclick="deleteClient(' + client.id + ')">Supprimer</button></td></tr>';
                });
                $('#clientTable tbody').html(html);
                $('#resultCount').text(data.length + ' resultats');
            },
            error: function(xhr) {
                alert('Erreur: ' + xhr.statusText);
            }
        });
    });
});

function deleteClient(id) {
    if (confirm('Supprimer ce client ?')) {
        $.ajax({
            url: 'api/clients/' + id,
            type: 'DELETE',
            success: function() {
                $('#searchBtn').click(); // Refresh
            }
        });
    }
}
</script>
</head>
<body>
<h1>Recherche Client</h1>
<input type="text" id="searchInput" placeholder="Nom, email...">
<button id="searchBtn">Rechercher</button>
<span id="resultCount"></span>
<table id="clientTable" border="1">
  <thead><tr><th>Nom</th><th>Email</th><th>Telephone</th><th>Actions</th></tr></thead>
  <tbody></tbody>
</table>
</body>
</html>""",
        "output": """// ClientSearch.tsx -- Recherche et gestion des clients
// Migre depuis: recherche-client.jsp (JSP + jQuery AJAX + DOM manipulation)
// TODO: [VALIDATION] Verifier que l'API /api/clients/search accepte les memes parametres
// TODO: [UX] Ajouter debounce sur la recherche pour eviter trop d'appels API
// TODO: [SECURITE] Ajouter confirmation modale au lieu de window.confirm pour la suppression
import { useState, useCallback } from 'react';
import { clientService } from '../services/clientService';
import { toast } from 'react-hot-toast';

interface Client {
  id: number;
  nom: string;
  email: string;
  telephone: string;
}

export default function ClientSearch() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await clientService.search(query);
      setClients(data);
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleDelete = useCallback(async (id: number) => {
    // TODO: [UX] Remplacer par un Dialog/Modal de confirmation
    if (!window.confirm('Supprimer ce client ?')) return;
    try {
      await clientService.delete(id);
      setClients(prev => prev.filter(c => c.id !== id));
      toast.success('Client supprime');
    } catch (err: any) {
      toast.error(`Erreur suppression: ${err.message}`);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Recherche Client</h1>

      {/* Barre de recherche */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nom, email..."
          className="flex-1 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Recherche...' : 'Rechercher'}
        </button>
      </div>

      {clients.length > 0 && (
        <p className="text-sm text-gray-500 mb-3">{clients.length} resultat(s)</p>
      )}

      {/* Tableau des resultats */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telephone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {clients.map(client => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{client.nom}</td>
                <td className="px-6 py-4">{client.email}</td>
                <td className="px-6 py-4">{client.telephone}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {clients.length === 0 && !loading && query && (
        <p className="text-center text-gray-400 py-8">Aucun resultat pour "{query}"</p>
      )}
    </div>
  );
}""",
        "category": "jquery_ajax_to_react",
    },
]

for ex in JQUERY_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme cette page JSP avec jQuery AJAX en composant React TypeScript moderne. Remplace les appels $.ajax par des services API propres:\n\n```jsp\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```tsx\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# 3. Struts Action + JSP → React + API Service
# ============================================================================

STRUTS_EXAMPLES = [
    {
        "input": """// VirementAction.java (Struts 1)
public class VirementAction extends Action {
    public ActionForward execute(ActionMapping mapping, ActionForm form,
            HttpServletRequest request, HttpServletResponse response) {
        VirementForm virementForm = (VirementForm) form;
        String compteSource = virementForm.getCompteSource();
        String compteDest = virementForm.getCompteDest();
        double montant = virementForm.getMontant();

        try {
            VirementService service = ServiceLocator.lookup("VirementService");
            service.effectuerVirement(compteSource, compteDest, montant);
            request.setAttribute("message", "Virement effectue avec succes");
            return mapping.findForward("success");
        } catch (SoldeInsuffisantException e) {
            request.setAttribute("error", "Solde insuffisant");
            return mapping.findForward("error");
        }
    }
}

// virement-form.jsp
<%@ taglib uri="http://struts.apache.org/tags-html" prefix="html" %>
<html:form action="/virement">
  <html:text property="compteSource" />
  <html:text property="compteDest" />
  <html:text property="montant" />
  <html:submit value="Effectuer le virement" />
  <html:errors />
</html:form>""",
        "output": """// VirementForm.tsx -- Formulaire de virement bancaire
// Migre depuis: VirementAction.java (Struts 1 Action) + virement-form.jsp
// TODO: [VALIDATION] Verifier les regles de validation metier (montant min/max, comptes valides)
// TODO: [SECURITE] Ajouter token CSRF et double confirmation pour les virements
// TODO: [METIER] Verifier que SoldeInsuffisantException est bien mappee en HTTP 400 cote backend
import { useState } from 'react';
import { virementService } from '../services/virementService';
import { toast } from 'react-hot-toast';

interface VirementData {
  compteSource: string;
  compteDest: string;
  montant: number;
}

export default function VirementForm() {
  const [form, setForm] = useState<VirementData>({
    compteSource: '',
    compteDest: '',
    montant: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.compteSource.trim()) newErrors.compteSource = 'Compte source requis';
    if (!form.compteDest.trim()) newErrors.compteDest = 'Compte destination requis';
    if (form.montant <= 0) newErrors.montant = 'Le montant doit etre positif';
    if (form.compteSource === form.compteDest) newErrors.compteDest = 'Les comptes doivent etre differents';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await virementService.effectuer(form);
      toast.success('Virement effectue avec succes');
      setForm({ compteSource: '', compteDest: '', montant: 0 });
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.code === 'SOLDE_INSUFFISANT') {
        toast.error('Solde insuffisant');
      } else {
        toast.error(`Erreur: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-md">
      <h2 className="text-2xl font-bold mb-6">Effectuer un virement</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Compte source"
          value={form.compteSource}
          onChange={v => setForm(f => ({ ...f, compteSource: v }))}
          error={errors.compteSource}
          placeholder="Ex: FR76 3000 1234 5678"
        />
        <FormField
          label="Compte destination"
          value={form.compteDest}
          onChange={v => setForm(f => ({ ...f, compteDest: v }))}
          error={errors.compteDest}
          placeholder="Ex: FR76 3000 8765 4321"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Montant (EUR)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.montant || ''}
            onChange={e => setForm(f => ({ ...f, montant: parseFloat(e.target.value) || 0 }))}
            className={`w-full border rounded px-3 py-2 ${errors.montant ? 'border-red-500' : ''}`}
          />
          {errors.montant && <p className="text-red-500 text-xs mt-1">{errors.montant}</p>}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Traitement...' : 'Effectuer le virement'}
        </button>
      </form>
    </div>
  );
}

function FormField({ label, value, onChange, error, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border rounded px-3 py-2 ${error ? 'border-red-500' : ''}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}""",
        "category": "struts_to_react",
    },
]

for ex in STRUTS_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme cette Action Struts + JSP en composant React TypeScript moderne avec service API:\n\n```java\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```tsx\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# 4. API Service generation (shared pattern for all frameworks)
# ============================================================================

SERVICE_EXAMPLES = [
    {
        "input": """// Legacy: CompteDAO.java (JDBC direct)
public class CompteDAO {
    public List<Compte> findAll() throws SQLException {
        Connection conn = DataSourceLocator.getConnection();
        PreparedStatement ps = conn.prepareStatement("SELECT * FROM COMPTE ORDER BY NUMERO");
        ResultSet rs = ps.executeQuery();
        List<Compte> comptes = new ArrayList<>();
        while (rs.next()) {
            Compte c = new Compte();
            c.setId(rs.getLong("ID"));
            c.setNumero(rs.getString("NUMERO"));
            c.setNomClient(rs.getString("NOM_CLIENT"));
            c.setSolde(rs.getDouble("SOLDE"));
            comptes.add(c);
        }
        return comptes;
    }

    public Compte findById(long id) throws SQLException { /* ... */ }
    public void create(Compte compte) throws SQLException { /* ... */ }
    public void update(Compte compte) throws SQLException { /* ... */ }
    public void delete(long id) throws SQLException { /* ... */ }
}""",
        "output": """// accountService.ts -- Service API pour les comptes
// Migre depuis: CompteDAO.java (JDBC direct → REST API client)
// TODO: [CONFIGURATION] Verifier que API_BASE_URL pointe vers le bon backend Spring Boot
// TODO: [SECURITE] Ajouter le token JWT dans les headers si l'authentification est requise
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface Account {
  id: number;
  numero: string;
  nomClient: string;
  solde: number;
}

export interface CreateAccountDto {
  numero: string;
  nomClient: string;
  soldeInitial: number;
}

class AccountService {
  private readonly baseUrl = `${API_BASE_URL}/accounts`;

  async getAll(): Promise<Account[]> {
    const { data } = await axios.get<Account[]>(this.baseUrl);
    return data;
  }

  async getById(id: number): Promise<Account> {
    const { data } = await axios.get<Account>(`${this.baseUrl}/${id}`);
    return data;
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const { data } = await axios.post<Account>(this.baseUrl, dto);
    return data;
  }

  async update(id: number, dto: Partial<CreateAccountDto>): Promise<Account> {
    const { data } = await axios.put<Account>(`${this.baseUrl}/${id}`, dto);
    return data;
  }

  async delete(id: number): Promise<void> {
    await axios.delete(`${this.baseUrl}/${id}`);
  }

  async search(query: string): Promise<Account[]> {
    const { data } = await axios.get<Account[]>(`${this.baseUrl}/search`, { params: { q: query } });
    return data;
  }
}

export const accountService = new AccountService();""",
        "category": "dao_to_api_service",
    },
]

for ex in SERVICE_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme ce DAO JDBC legacy en service API TypeScript (Axios) pour le frontend React:\n\n```java\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```typescript\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# 5. Angular examples
# ============================================================================

ANGULAR_EXAMPLES = [
    {
        "input": """<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<html>
<head><title>Gestion Polices Assurance</title></head>
<body>
<h1>Polices d'assurance</h1>
<form action="police" method="post">
  <input type="text" name="numero" value="${police.numero}" placeholder="Numero police">
  <input type="text" name="assure" value="${police.nomAssure}" placeholder="Nom assure">
  <select name="type">
    <option value="AUTO" ${police.type == 'AUTO' ? 'selected' : ''}>Automobile</option>
    <option value="HABITATION" ${police.type == 'HABITATION' ? 'selected' : ''}>Habitation</option>
    <option value="SANTE" ${police.type == 'SANTE' ? 'selected' : ''}>Sante</option>
  </select>
  <input type="number" name="prime" value="${police.primeAnnuelle}" step="0.01">
  <button type="submit">Enregistrer</button>
</form>
<c:if test="${not empty message}"><p style="color:green">${message}</p></c:if>
<c:if test="${not empty error}"><p style="color:red">${error}</p></c:if>
</body>
</html>""",
        "output": """// police-form.component.ts -- Formulaire de gestion des polices d'assurance
// Migre depuis: police-form.jsp (JSP + JSTL + form POST)
// TODO: [VALIDATION] Ajouter les validations metier ACORD (numero police, format prime)
// TODO: [METIER] Verifier les types de police avec le referentiel backend
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { PoliceService, Police, PoliceType } from '../services/police.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-police-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="container mx-auto p-6 max-w-lg">
      <h1 class="text-2xl font-bold mb-6">Police d'assurance</h1>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Numero police</label>
          <input formControlName="numero" class="w-full border rounded px-3 py-2"
                 placeholder="Numero police">
          <p *ngIf="form.get('numero')?.invalid && form.get('numero')?.touched"
             class="text-red-500 text-xs mt-1">Numero requis</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Nom assure</label>
          <input formControlName="assure" class="w-full border rounded px-3 py-2"
                 placeholder="Nom assure">
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Type</label>
          <select formControlName="type" class="w-full border rounded px-3 py-2">
            <option *ngFor="let t of policeTypes" [value]="t.value">{{ t.label }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Prime annuelle (EUR)</label>
          <input formControlName="prime" type="number" step="0.01"
                 class="w-full border rounded px-3 py-2">
        </div>

        <button type="submit" [disabled]="form.invalid || submitting"
                class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {{ submitting ? 'Enregistrement...' : 'Enregistrer' }}
        </button>
      </form>

      <p *ngIf="message" class="text-green-600 mt-4">{{ message }}</p>
      <p *ngIf="error" class="text-red-600 mt-4">{{ error }}</p>
    </div>
  `
})
export class PoliceFormComponent implements OnInit {
  form!: FormGroup;
  submitting = false;
  message = '';
  error = '';

  policeTypes: { value: PoliceType; label: string }[] = [
    { value: 'AUTO', label: 'Automobile' },
    { value: 'HABITATION', label: 'Habitation' },
    { value: 'SANTE', label: 'Sante' },
  ];

  constructor(
    private fb: FormBuilder,
    private policeService: PoliceService,
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      numero: ['', Validators.required],
      assure: ['', Validators.required],
      type: ['AUTO', Validators.required],
      prime: [0, [Validators.required, Validators.min(0)]],
    });
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.submitting = true;
    this.message = '';
    this.error = '';

    try {
      await this.policeService.save(this.form.value);
      this.message = 'Police enregistree avec succes';
      this.form.reset({ type: 'AUTO', prime: 0 });
    } catch (err: any) {
      this.error = err.error?.message || 'Erreur lors de l\\'enregistrement';
    } finally {
      this.submitting = false;
    }
  }
}""",
        "category": "jsp_to_angular",
    },
]

for ex in ANGULAR_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme cette page JSP legacy en composant Angular standalone TypeScript moderne:\n\n```jsp\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```typescript\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# 6. Vue 3 examples
# ============================================================================

VUE_EXAMPLES = [
    {
        "input": """<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<html>
<head><title>Dashboard Patients</title>
<script src="jquery.min.js"></script>
<script>
$(function() {
    loadPatients();
    setInterval(loadPatients, 30000);
});
function loadPatients() {
    $.getJSON('api/patients', function(data) {
        var html = '';
        $.each(data, function(i, p) {
            html += '<div class="patient-card">';
            html += '<h3>' + p.nom + ' ' + p.prenom + '</h3>';
            html += '<p>Chambre: ' + p.chambre + '</p>';
            html += '<p>Diagnostic: ' + p.diagnostic + '</p>';
            html += '<span class="status ' + p.statut + '">' + p.statut + '</span>';
            html += '</div>';
        });
        $('#patientGrid').html(html);
    });
}
</script>
</head>
<body>
<h1>Patients hospitalises</h1>
<div id="patientGrid"></div>
</body>
</html>""",
        "output": """<!-- PatientDashboard.vue -- Dashboard des patients hospitalises -->
<!-- Migre depuis: dashboard-patients.jsp (JSP + jQuery + setInterval polling) -->
<!-- TODO: [VALIDATION] Verifier le mapping des statuts patient avec le backend -->
<!-- TODO: [PERFORMANCE] Remplacer le polling par WebSocket si le backend le supporte -->
<!-- TODO: [METIER] Verifier la conformite HL7/FHIR des donnees patient -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { patientService, type Patient } from '../services/patientService';

const patients = ref<Patient[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let pollInterval: ReturnType<typeof setInterval> | null = null;

const statusConfig: Record<string, { label: string; class: string }> = {
  STABLE: { label: 'Stable', class: 'bg-green-100 text-green-800' },
  CRITIQUE: { label: 'Critique', class: 'bg-red-100 text-red-800' },
  EN_OBSERVATION: { label: 'En observation', class: 'bg-yellow-100 text-yellow-800' },
  SORTI: { label: 'Sorti', class: 'bg-gray-100 text-gray-800' },
};

async function loadPatients() {
  try {
    patients.value = await patientService.getAll();
    error.value = null;
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadPatients();
  // Polling toutes les 30s (comme l'original)
  // TODO: [PERFORMANCE] Migrer vers WebSocket pour le temps reel
  pollInterval = setInterval(loadPatients, 30000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="container mx-auto p-6">
    <h1 class="text-2xl font-bold mb-6">Patients hospitalises</h1>

    <div v-if="loading" class="text-center py-8">Chargement...</div>
    <div v-else-if="error" class="text-red-600 p-4">Erreur: {{ error }}</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="patient in patients"
        :key="patient.id"
        class="bg-white rounded-lg shadow p-4 border hover:shadow-md transition-shadow"
      >
        <h3 class="text-lg font-semibold">{{ patient.nom }} {{ patient.prenom }}</h3>
        <p class="text-gray-600 mt-1">Chambre: {{ patient.chambre }}</p>
        <p class="text-gray-600">Diagnostic: {{ patient.diagnostic }}</p>
        <span
          :class="['inline-block mt-2 px-2 py-1 rounded text-xs font-medium', statusConfig[patient.statut]?.class || 'bg-gray-100']"
        >
          {{ statusConfig[patient.statut]?.label || patient.statut }}
        </span>
      </div>
    </div>

    <p v-if="!loading && patients.length === 0" class="text-center text-gray-400 py-8">
      Aucun patient hospitalise
    </p>
  </div>
</template>""",
        "category": "jsp_to_vue",
    },
]

for ex in VUE_EXAMPLES:
    entries.append({
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transforme cette page JSP legacy avec jQuery en composant Vue 3 SFC (Composition API) TypeScript:\n\n```jsp\n{ex['input']}\n```"},
            {"role": "assistant", "content": f"```vue\n{ex['output']}\n```"},
        ],
        "category": ex["category"],
    })

# ============================================================================
# Write output
# ============================================================================

output_path = os.path.join(os.path.dirname(__file__), "frontend-dataset.jsonl")
with open(output_path, "w", encoding="utf-8") as f:
    for entry in entries:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

# Update stats
stats = {
    "total_entries": len(entries),
    "generated_at": datetime.now().isoformat(),
    "by_category": {},
}
for entry in entries:
    cat = entry["category"]
    stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

stats_path = os.path.join(os.path.dirname(__file__), "frontend-dataset-stats.json")
with open(stats_path, "w", encoding="utf-8") as f:
    json.dump(stats, f, indent=2, ensure_ascii=False)

print(f"Generated {len(entries)} frontend training entries")
print(f"Categories: {stats['by_category']}")
print(f"Output: {output_path}")
print(f"Stats: {stats_path}")
