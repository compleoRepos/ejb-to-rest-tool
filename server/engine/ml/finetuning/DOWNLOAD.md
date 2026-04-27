# Téléchargement des fichiers volumineux

Les fichiers suivants sont trop volumineux pour Git et sont hébergés sur le stockage S3 du projet :

## Dataset de fine-tuning (310 MB)

**Fichier** : `finetuning-dataset.jsonl`
**Chemin S3** : `/manus-storage/finetuning-dataset_c2dc1baa.jsonl`
**Taille** : 310 MB
**Entrées** : 27 237 paires legacy → Spring Boot
**Format** : JSONL (OpenAI Messages)

Pour télécharger, accédez à l'URL du projet :
```
https://modernizer-demo.com/manus-storage/finetuning-dataset_c2dc1baa.jsonl
```

## Catalogue des repos (289 KB)

**Fichier** : `repos-catalog.json`
**Chemin S3** : `/manus-storage/repos-catalog_40d7e094.json`
**Taille** : 289 KB
**Contenu** : Liste des 1000 repos GitHub sélectionnés avec scores

Pour télécharger :
```
https://modernizer-demo.com/manus-storage/repos-catalog_40d7e094.json
```

## Téléchargement automatique

Placez les fichiers téléchargés dans ce répertoire (`server/engine/ml/finetuning/`) :

```bash
cd server/engine/ml/finetuning/
# Les fichiers doivent être nommés :
# - finetuning-dataset.jsonl
# - repos-catalog.json
```
