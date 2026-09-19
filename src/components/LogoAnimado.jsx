import { useEffect, useState } from "react"

// Cuánto dura cada fase del ciclo. La entrada termina con el confeti a los
// 1.82 s; se deja ver un momento antes de salir. La salida termina a 1.15 s y
// hay una pausa corta con el lienzo vacío antes de volver a entrar.
const MS_ENTRA_Y_SE_VE = 3200
const MS_SALE_Y_PAUSA  = 1500

// Logo de la marca, partido en capas para que entre por partes durante la
// carga. Va en línea y no como <img> porque cada capa se anima por separado:
// primero el plato, luego el nombre, y la fiesta alrededor al final.
// Con `ciclo`, al terminar de entrar sale al revés y vuelve a entrar, una y
// otra vez, mientras siga montado (en la carga: hasta que entra al panel).
export default function LogoAnimado({ size = 280, animar = true, ciclo = false }) {
  const [fase, setFase] = useState("entrando")

  useEffect(() => {
    if (!animar || !ciclo) return
    const t = setTimeout(
      () => setFase(f => f === "entrando" ? "saliendo" : "entrando"),
      fase === "entrando" ? MS_ENTRA_Y_SE_VE : MS_SALE_Y_PAUSA,
    )
    return () => clearTimeout(t)
  }, [fase, animar, ciclo])

  return (
    <svg
      className={"logo-animado" + (animar ? " " + fase : "")}
      viewBox="0 0 1080 950"
      width={size}
      role="img"
      aria-label="El Tianguis"
    >
  <defs>
      {/* Arco para el texto */}
      <path id="arcoTexto" d="M 262,625 A 275,275 0 1 1 758,382" fill="none"/>
      {/* Recorte: cuadro blanco de la servilleta */}
      <clipPath id="clipCuadro"><rect x="365" y="345" width="400" height="360"/></clipPath>
      {/* Recorte: servilleta negra sin el cuadro blanco */}
      <clipPath id="clipNegro">
        <path d="M360,340 H930 V905 H360 Z M365,345 V705 H765 V345 Z" clipRule="evenodd"/>
      </clipPath>
      {/* Cubiertos (inclinados) */}
      <g id="cubiertos">
        <g transform="translate(760,560) rotate(-30)">
          {/* Cuchillo */}
          <path d="M-30,-190 C-10,-200 20,-150 28,-60 L28,20 Q28,30 18,30 L-12,30 Q-22,30 -22,20 L-22,-60 C-30,-110 -40,-170 -30,-190 Z"/>
          <path d="M-22,25 L28,25 L28,220 Q28,232 16,232 L-10,232 Q-22,232 -22,220 Z"/>
          {/* Tenedor */}
          <g transform="translate(-75,0)">
            <path d="M-32,-180 L-20,-180 L-20,-95 L-8,-95 L-8,-180 L4,-180 L4,-95 L16,-95 L16,-180 L28,-180 L28,-80 Q28,-40 0,-30 Q-32,-40 -32,-80 Z"/>
            <path d="M-14,-35 L14,-35 L14,220 Q14,232 2,232 L-2,232 Q-14,232 -14,220 Z"/>
          </g>
          {/* Cuchara */}
          <g transform="translate(-160,60)">
            <ellipse cx="0" cy="-120" rx="42" ry="60"/>
            <path d="M-14,-70 L14,-70 L14,190 Q14,202 2,202 L-2,202 Q-14,202 -14,190 Z"/>
          </g>
        </g>
      </g>
    </defs>
      <g className="lg-fondo">
  <rect width="1080" height="950" fill="#2B1F5C"/>
      </g>
      <g className="lg-ambiente">
  <g fill="#6E5EA8">
    <circle cx="60" cy="40" r="90"/>
    <circle cx="170" cy="15" r="70"/>
    <circle cx="990" cy="900" r="110"/>
    <circle cx="880" cy="930" r="80"/>
  </g>

  <g stroke="#1E153F" strokeWidth="4" strokeLinejoin="round">
    <g>
      <ellipse cx="905" cy="150" rx="120" ry="140" fill="#2FB39A"/>
      <polygon points="905,288 890,308 920,308" fill="#2FB39A"/>
      <ellipse cx="860" cy="95" rx="22" ry="34" fill="#5FD0BA" stroke="none" transform="rotate(-25 860 95)"/>
    </g>
    <g>
      <ellipse cx="1000" cy="340" rx="100" ry="118" fill="#E64C8E"/>
      <polygon points="1000,456 986,476 1014,476" fill="#E64C8E"/>
      <ellipse cx="962" cy="292" rx="18" ry="28" fill="#F28AB8" stroke="none" transform="rotate(-25 962 292)"/>
    </g>
    <g>
      <ellipse cx="1030" cy="500" rx="95" ry="112" fill="#8E52B5"/>
      <polygon points="1030,610 1016,630 1044,630" fill="#8E52B5"/>
      <ellipse cx="995" cy="455" rx="17" ry="27" fill="#B384D6" stroke="none" transform="rotate(-25 995 455)"/>
    </g>
    <g>
      <ellipse cx="1000" cy="690" rx="100" ry="118" fill="#E9E3F3"/>
      <polygon points="1000,806 986,826 1014,826" fill="#E9E3F3"/>
    </g>
    <g>
      <ellipse cx="1050" cy="860" rx="90" ry="105" fill="#2FB39A"/>
      <ellipse cx="1015" cy="820" rx="16" ry="25" fill="#5FD0BA" stroke="none" transform="rotate(-25 1015 820)"/>
    </g>
  </g>

  <g fill="none" stroke="#F7F3FB" strokeWidth="3" strokeLinecap="round">
    <path d="M905,308 q-20,60 10,120"/>
    <path d="M1000,476 q-15,50 10,100"/>
    <path d="M1030,630 q-10,50 5,90"/>
    <path d="M1000,826 q-10,40 5,80"/>
  </g>
      </g>
      <g className="lg-banderines">
  <path d="M0,215 Q300,60 640,8" fill="none" stroke="#F7F3FB" strokeWidth="5"/>
  <g stroke="#1E153F" strokeWidth="3" strokeLinejoin="round">
    <polygon points="40,194 106,164 107,251" fill="#E64C8E"/>
    <polygon points="132,153 198,125 195,213" fill="#F5C000"/>
    <polygon points="225,115 293,91 286,178" fill="#8E52B5"/>
    <polygon points="321,82 389,62 378,149" fill="#F5C000"/>
    <polygon points="418,54 488,36 472,123" fill="#E64C8E"/>
    <polygon points="517,30 587,16 567,101" fill="#F5C000"/>
  </g>
      </g>
      <g className="lg-confeti">
  <g strokeWidth="6" strokeLinecap="round" fill="none">
    <path d="M60,280 q15,-20 30,0 t30,0" stroke="#F5C000"/>
    <path d="M700,80 q15,-20 30,0 t30,0" stroke="#F7F3FB"/>
    <path d="M160,880 q15,-20 30,0 t30,0" stroke="#E64C8E"/>
    <path d="M880,720 q15,-20 30,0 t30,0" stroke="#F5C000"/>
    <path d="M40,600 q20,15 0,30" stroke="#2FB39A"/>
    <path d="M980,620 q20,15 0,30" stroke="#E64C8E"/>
  </g>
  <g>
    <circle cx="120" cy="320" r="7" fill="#2FB39A"/>
    <circle cx="200" cy="270" r="7" fill="#F5C000"/>
    <circle cx="80" cy="470" r="7" fill="#E64C8E"/>
    <circle cx="130" cy="640" r="7" fill="#F7F3FB"/>
    <circle cx="210" cy="760" r="7" fill="#2FB39A"/>
    <circle cx="300" cy="900" r="7" fill="#F5C000"/>
    <circle cx="640" cy="120" r="7" fill="#E64C8E"/>
    <circle cx="760" cy="40" r="7" fill="#2FB39A"/>
    <circle cx="820" cy="880" r="7" fill="#E64C8E"/>
    <circle cx="940" cy="640" r="7" fill="#F5C000"/>
    <rect x="240" y="60" width="16" height="9" fill="#E64C8E" transform="rotate(20 248 64)"/>
    <rect x="720" y="160" width="16" height="9" fill="#F5C000" transform="rotate(-30 728 164)"/>
    <rect x="40" y="380" width="16" height="9" fill="#F7F3FB" transform="rotate(45 48 384)"/>
    <rect x="290" y="800" width="16" height="9" fill="#2FB39A" transform="rotate(-20 298 804)"/>
    <rect x="880" y="600" width="16" height="9" fill="#F7F3FB" transform="rotate(30 888 604)"/>
  </g>
      </g>
      <g className="lg-plato">
  <circle cx="500" cy="480" r="345" fill="#FFFFFF" stroke="#1E153F" strokeWidth="6"/>
  <circle cx="500" cy="480" r="235" fill="none" stroke="#111111" strokeWidth="10"/>
      </g>
      <g className="lg-titulo">
  <text fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="84" fill="#D8A620" letterSpacing="6">
    <textPath href="#arcoTexto" startOffset="50%" textAnchor="middle">EL TIANGUIS</textPath>
  </text>
      </g>
      <g className="lg-servilleta">
  <rect x="360" y="340" width="570" height="565" fill="#111111"/>

  <rect x="365" y="345" width="400" height="360" fill="#FFFFFF"/>

  <g clipPath="url(#clipCuadro)">
    {/* Confeti y serpentinas */}
    <g strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M385,380 q12,-18 24,0 t24,0 t24,0" stroke="#2FB39A"/>
      <path d="M470,360 q12,-18 24,0 t24,0" stroke="#E64C8E"/>
      <path d="M395,430 q12,18 24,0 t24,0" stroke="#F5C000"/>
      <path d="M560,420 q12,-18 24,0 t24,0" stroke="#8E52B5"/>
      <path d="M400,570 q12,-18 24,0 t24,0" stroke="#E64C8E"/>
      <path d="M560,600 q12,18 24,0 t24,0" stroke="#2FB39A"/>
    </g>
    <g>
      <circle cx="405" cy="360" r="4" fill="#E64C8E"/><circle cx="440" cy="400" r="4" fill="#2FB39A"/>
      <circle cx="500" cy="395" r="4" fill="#F5C000"/><circle cx="530" cy="450" r="4" fill="#8E52B5"/>
      <circle cx="580" cy="470" r="4" fill="#E64C8E"/><circle cx="600" cy="540" r="4" fill="#2FB39A"/>
      <circle cx="430" cy="500" r="4" fill="#F5C000"/><circle cx="470" cy="620" r="4" fill="#8E52B5"/>
      <circle cx="560" cy="640" r="4" fill="#E64C8E"/><circle cx="590" cy="580" r="4" fill="#F5C000"/>
      <circle cx="380" cy="520" r="4" fill="#2FB39A"/><circle cx="520" cy="480" r="4" fill="#E64C8E"/>
    </g>
    {/* Globos pequeños */}
    <g strokeWidth="2" strokeLinecap="round" fill="none">
      <path d="M457,522 q-8,20 6,38" stroke="#111"/>
      <path d="M520,512 q-6,22 4,40" stroke="#111"/>
      <path d="M578,522 q-10,18 -4,40" stroke="#111"/>
      <path d="M487,588 q-8,18 4,32" stroke="#111"/>
      <path d="M540,586 q-6,18 0,32" stroke="#111"/>
    </g>
    <g>
      <ellipse cx="457" cy="492" rx="27" ry="32" fill="#E53935"/>
      <ellipse cx="520" cy="482" rx="27" ry="32" fill="#EC1B84"/>
      <ellipse cx="580" cy="492" rx="27" ry="32" fill="#43B04A"/>
      <ellipse cx="487" cy="556" rx="27" ry="32" fill="#1E3A8A"/>
      <ellipse cx="540" cy="554" rx="27" ry="32" fill="#F26A1B"/>
    </g>
    {/* Pastelito */}
    <g>
      <rect x="430" y="614" width="10" height="28" fill="#F5C000"/>
      <ellipse cx="435" cy="608" rx="6" ry="9" fill="#F26A1B"/>
      <path d="M400,640 Q435,600 470,640 Z" fill="#1E6FE8"/>
      <path d="M400,640 L470,640 L460,690 L410,690 Z" fill="#1E6FE8"/>
      <ellipse cx="435" cy="640" rx="36" ry="10" fill="#1E6FE8"/>
    </g>
    {/* T dorada */}
    <g fill="#D8A620">
      <rect x="520" y="365" width="230" height="44" rx="22"/>
      <rect x="615" y="365" width="42" height="280" rx="21"/>
    </g>
  </g>
      </g>
      <g className="lg-cubiertos">
  <use href="#cubiertos" fill="#111111" stroke="#FFFFFF" strokeWidth="5" strokeLinejoin="round" paintOrder="stroke"/>
      </g>
      <g className="lg-vasos">
  <g stroke="#111111" strokeWidth="5" strokeLinejoin="round">
    <path d="M770,400 L850,400 L840,530 L780,530 Z" fill="#FFFFFF"/>
    <path d="M790,405 L786,525 M810,405 L810,525 M830,405 L834,525 M775,440 L845,440" fill="none" strokeWidth="4"/>
  </g>

  <g stroke="#111111" strokeWidth="6" strokeLinejoin="round">
    <path d="M395,720 L585,720 L570,900 L410,900 Z" fill="#FFFFFF"/>
    <path d="M393,750 L587,750 L583,790 L397,790 Z" fill="#111111" stroke="none"/>
  </g>
      </g>
    </svg>
  )
}
