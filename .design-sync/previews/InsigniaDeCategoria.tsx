import { InsigniaDeCategoria } from "app-anonimizador";

export const LasCuatroCategorias = () => (
  <div className="flex flex-wrap items-center gap-2">
    <InsigniaDeCategoria categoria="identificador-directo" />
    <InsigniaDeCategoria categoria="cuasi-identificador" />
    <InsigniaDeCategoria categoria="dato-sensible" />
    <InsigniaDeCategoria categoria="no-personal" />
  </div>
);

export const EnUnaFilaDeColumna = () => (
  <table className="w-full text-[0.9375rem]">
    <tbody className="text-tinta">
      <tr className="border-borde border-b">
        <td className="py-2 pr-4 font-mono text-[0.8125rem]">cedula</td>
        <td className="py-2">
          <InsigniaDeCategoria categoria="identificador-directo" />
        </td>
      </tr>
      <tr className="border-borde border-b">
        <td className="py-2 pr-4 font-mono text-[0.8125rem]">
          fecha_nacimiento
        </td>
        <td className="py-2">
          <InsigniaDeCategoria categoria="cuasi-identificador" />
        </td>
      </tr>
      <tr>
        <td className="py-2 pr-4 font-mono text-[0.8125rem]">diagnostico</td>
        <td className="py-2">
          <InsigniaDeCategoria categoria="dato-sensible" />
        </td>
      </tr>
    </tbody>
  </table>
);
