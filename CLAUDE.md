# AIROS · notas para quem trabalha neste projeto

## Marca da Airos

O material oficial da marca está no Google Drive do escritório (conta inovva.arquitetura@gmail.com),
na pasta **AIROS**. Use sempre essa pasta para qualquer coisa visual da Airos (sistema, PDFs,
apresentações, posts):

- `AIROS/Identidade.Airos.Final_compressed.pdf`: manual da marca.
- `AIROS/Originais Eletrônicos/Logo/principal`: logotipo "AIROS arq" (SVG, PNG, PDF).
  `…/secundária`: só "AIROS". `…/descritivo_negocio`: símbolo "arq".
- `AIROS/Originais Eletrônicos/Cores/RGB/cores_airos_rgb.pdf`: paleta.
- `AIROS/Originais Eletrônicos/Fontes`: Roobert, só em versão TRIAL (não usar em produção sem licença).
- `AIROS/Originais Eletrônicos/Grafismo`: grids e interseção para posts, stories e A4.

Paleta (RGB):

| Cor | Hex | Escuro |
|---|---|---|
| Preto couro | #232323 | #111111 |
| Concreto | #505049 | #35352D |
| Mármore claro | #E6DACF | #B2A8A1 |
| Madeira nobre | #461602 | #2F0B00 |
| Céu | #C5CBCB | #8EA3A1 |

No sistema: tokens em `src/styles/tokens.css` e `src/styles/theme.css` (neutros = céu/concreto,
`brand` = madeira nobre com mármore nos tons claros, botão principal em preto couro). O logotipo
está em `src/components/layout/AirosLogo.tsx` e o ícone em `public/favicon.svg`.
