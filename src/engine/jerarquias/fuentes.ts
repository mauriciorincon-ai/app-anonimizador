// De dónde sale cada escalera de fábrica (S7), para el certificado.
//
// El detalle completo —editor, título, SHA-256 de cada documento descargado y cómo se derivó la
// tabla— vive en `fabrica/*.meta.json`, que solo lee el worker. El certificado se arma en la página,
// así que aquí va lo que el documento cita: la URL y la fecha de consulta (el título y la versión
// son texto redactado y viven en el catálogo, `DOCUMENTOS.generalizacion.fuentes`). Un test exige
// que estas URL y fechas sean las del `.meta.json`: si una tabla se regenera, el certificado no se
// queda citando la fuente vieja.

import type { JerarquiaDeFabrica } from "./fabrica";

export type ClaveDeFuente =
  | "divipola"
  | "regiones"
  | "ciiu"
  | "edadesSimples"
  | "grandesGrupos";

export const FUENTES: Readonly<
  Record<ClaveDeFuente, { readonly url: string; readonly consultada: string }>
> = {
  divipola: {
    url: "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",
    consultada: "2026-11-02",
  },
  regiones: {
    url: "http://www.secretariasenado.gov.co/senado/basedoc/ley_2056_2020_pr001.html",
    consultada: "2026-11-02",
  },
  ciiu: {
    url: "https://www.dane.gov.co/files/sen/nomenclatura/ciiu/Estructura-detallada-CIIU-4AC-2022.xlsx",
    consultada: "2026-11-02",
  },
  // La edad no tiene tabla derivada ni `.meta.json`: sus dos documentos se citan aquí. SHA-256 de lo
  // descargado el 2026-11-02, para quien quiera comprobar que cita la misma versión:
  //   PPED-AreaSexoEdadNac-2018-2070.xlsx  898f544bee2129723460424095d8b294b828fbbd37b3e87f639c3982a225a5aa
  //   NotaTecnica-PPED-jul2025.pdf         ab71bcb2a5ee0f0fce85cd0c8740cd2dac332984c2dc2ac419a8bdc7b3c65b72
  edadesSimples: {
    url: "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Nacional/PPED-AreaSexoEdadNac-2018-2070.xlsx",
    consultada: "2026-11-02",
  },
  grandesGrupos: {
    url: "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Nacional/NotaTecnica-PPED-jul2025.pdf",
    consultada: "2026-11-02",
  },
};

/** Las fuentes que cita cada escalera de fábrica, en el orden en que se dicen. */
export const FUENTES_DE_LA_ESCALERA: Readonly<
  Record<JerarquiaDeFabrica, readonly ClaveDeFuente[]>
> = {
  divipola: ["divipola", "regiones"],
  ciiu: ["ciiu"],
  "edad-dane": ["edadesSimples", "grandesGrupos"],
};
