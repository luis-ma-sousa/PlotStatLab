# Prismatica — plano de produto e execução

Aplicação científica local inspirada no fluxo do GraphPad Prism, com identidade e implementação próprias. Prioridades aprovadas: qualidade gráfica, edição por cliques, vários tipos de gráficos, análise estatística assistida, significância automática com ajuste manual, exportação PNG/SVG e projetos reeditáveis.

## Requisitos incorporados

1. Transferir formatação entre gráficos e guardar presets. Selecionar estilo completo, cores, fontes, eixos ou pontos. Não substituir dados, análises ou exceções visuais individuais.
2. Catálogo amplo: bar+swarm é um mínimo. A primeira entrega inclui barras, swarm, box, violin, raincloud, paired, XY scatter, linhas, histogramas, densidade, ECDF e heatmap. Dose–resposta, Kaplan–Meier, forest, Bland–Altman, volcano, gráficos agrupados de dois fatores e multipainel são etapas seguintes.
3. Cada observação tem ID estável. Edição individual de cor, forma, tamanho, opacidade e contorno, preservada ao guardar/reabrir. Aparência não altera os valores científicos.
4. Assistente de testes que deteta compatibilidade e pede desenho experimental explícito. Não inferir emparelhamento, independência ou validade experimental só dos números; não selecionar um teste por um teste de normalidade automático.
5. Asteriscos derivados de comparações reais, com p ajustado, correção explícita, ligações e headroom automático. Arrastar e editar deslocação manual, opção de restaurar automático. Alterações de dados/configuração tornam resultados anteriores obsoletos.
6. Projeto versionado contém dados, configurações, resultados, estilos, overrides individuais e posições manuais. Autosave, undo/redo e ficheiro portátil .labplot.
7. Exportação SVG vetorial e PNG com dimensões controladas. Seleção e controlos do editor não aparecem na exportação.

## Fases e critérios

- Fundação: React/TypeScript + SVG, motor Python/SciPy local, identidade visual, formato de projeto. Critério: editor navega entre dados/gráficos/análises.
- Fluxo funcional: catálogo base, dados editáveis/importados, estilos transferíveis, análise, anotações, exportação e reabertura. Critério: todo o percurso funciona com dados reais.
- Ciência ampliada: dois fatores, modelos mistos, correlação/regressão, dose–resposta, sobrevivência. Cada análise entra apenas com validação e interface própria.
- Publicação: composições multipainel, tipografia científica avançada, presets de revistas, exportação em lote.
- Distribuição: instalador desktop, migrações e recuperação, acessibilidade e desempenho com conjuntos grandes.

## Estatística inicial

Welch e Student independentes, t emparelhado, Mann–Whitney, Wilcoxon, ANOVA um fator, Welch ANOVA, ANOVA/Tukey, Kruskal–Wallis e Friedman conforme suporte validado. Comparações planeadas usam testes de pares e correção Holm/Bonferroni/BH explicitada; Tukey tem correção própria. IDs de indivíduos são obrigatórios para emparelhamento.

## Validação

Referências numéricas conhecidas e casos inválidos; alinhamento dos pares por ID; correção de comparações; colisões dos pontos e ligações; edições individuais persistem; roundtrip do projeto; estilos não mudam dados; resultados obsoletos não geram asteriscos; deslocação manual persiste; exportação sem UI e dimensões exatas. Verificação em navegador do fluxo completo.

## Limites explícitos da primeira entrega

Primeira versão funcional em navegador local, sem instalador nativo. Formatos próprios são integralmente reeditáveis; PNG/SVG ou ficheiros Prism não permitem reconstrução garantida. O catálogo e análises especializados acima são trabalho planeado, não funcionalidades já concluídas. Dados e autosave ficam locais; GitHub recebe apenas código e dados sintéticos de exemplo.

## Referências

- https://docs.scipy.org/doc/scipy/reference/stats.html
- https://www.graphpad.com/guides/prism/latest/user-guide/simple_pairwise_comparisons.htm
- https://www.graphpad.com/guides/prism/latest/statistics/stat_exact_p_values_from_multiple_c.htm
- https://react.dev/learn/responding-to-events
- https://vite.dev/guide/
