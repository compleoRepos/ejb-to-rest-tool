# Test Multi-File Results

## What works:
1. Tab system: PaymentProcessor.java, NewFile2.java, LookupJNDI.java all visible as tabs
2. + button creates new empty tabs (NewFile2.java)
3. Loading examples adds new tabs (LookupJNDI.java)
4. Tab switching works correctly
5. Analysis button works across all 3 files simultaneously
6. Report tab shows consolidated report with all 3 files
7. Status bar shows "3 fichier(s)", "3 service(s)", "5 dép."
8. Toast notification: "Analyse terminée : 3 service(s) détecté(s) dans 3 fichier(s)"
9. Per-tab badges visible (3 @EJB, 4 JNDI, 0 @EJB · 2 appels)
10. Report includes per-file breakdown + global mapping REST

## Next: Test Transformer button
