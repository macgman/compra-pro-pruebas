# Código fuente modular COMPRA PRO

El código fuente se conserva como fragmentos ordenados del mismo ámbito JavaScript para
mantener compatibilidad con funciones globales, eventos inline y módulos heredados.

- `modules/`: 17 secciones ordenadas.
- `modules.json`: orden de concatenación.
- `build.py`: reconstruye `js/app.js` sin alterar el orden.

Ejecutar desde la raíz `compra-web`:

```bash
python src/build.py
```

`js/app.js` es el bundle que consume `index.html`. No cambiar el orden sin ejecutar pruebas.
La migración a módulos ES independientes queda como siguiente refactor, porque exige sustituir
dependencias globales y manejadores inline de manera gradual.
