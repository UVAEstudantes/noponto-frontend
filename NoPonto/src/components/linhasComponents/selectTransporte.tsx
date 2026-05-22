import { useEffect, useRef, useState, useCallback } from "react";
import { useTema } from "@/src/hooks/useTema";
import { Pressable, View, Text, Animated } from "react-native";

interface Props {
  modal: string | null;
  setModal: (modal: string) => void;
}

const TIPO_MODAIS = ["Onibus", "BRT", "Trem", "Metro"];
const normalizar = (v?: string | null) =>
  (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function SelectTransporte(props: Props) {
  const { cores } = useTema();
  const animLeft = useRef(new Animated.Value(0)).current;
  const inicializadoRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const sliderWidth = 85;

  const getPos = useCallback(
    (index: number, width: number) => {
      const btnWidth = width / 4;
      let toPosition = index * btnWidth + (btnWidth - sliderWidth) / 2;

      if (index === 0) toPosition += 7;
      else if (index === 1) toPosition += 3;
      else if (index === 2) toPosition -= 3;
      else if (index === 3) toPosition -= 7;

      return toPosition;
    },
    [sliderWidth],
  );

  useEffect(() => {
    if (containerWidth > 0 && !inicializadoRef.current) {
      const initialIndex = TIPO_MODAIS.findIndex(
        (m) => normalizar(m) === normalizar(props.modal),
      );
      const targetIndex = initialIndex !== -1 ? initialIndex : 0;
      const initialPos = getPos(targetIndex, containerWidth);

      animLeft.setValue(initialPos);
      inicializadoRef.current = true;
    }
  }, [containerWidth, animLeft, getPos, props.modal]);

  function clickModal(modalSelect: string, index: number) {
    props.setModal(modalSelect);
    const toPosition = getPos(index, containerWidth);

    Animated.spring(animLeft, {
      toValue: toPosition,
      bounciness: 5,
      speed: 12,
      useNativeDriver: false,
    }).start();
  }

  return (
    <View
      className="mt-8 flex-row justify-around w-[90%] px-1 bg-customLightGray py-2 rounded-xl self-center"
      style={{ backgroundColor: cores.fundoSecundario }}
      onLayout={(event) => {
        setContainerWidth(event.nativeEvent.layout.width);
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 7,
          left: animLeft,
          width: sliderWidth,
          height: "100%",
          backgroundColor: cores.fundoPrimario,
          borderRadius: 10,
        }}
      />

      {TIPO_MODAIS.map((item, index) => (
        <Pressable
          key={item}
          onPress={() => clickModal(item, index)}
          className={"px-6 py-3 rounded-xl"}
        >
          <Text
            style={{
              color:
                normalizar(props.modal) === normalizar(item)
                  ? cores.textoInverso
                  : cores.textoPrimario,
              fontWeight: "600",
            }}
          >
            {item === "Onibus" ? "Ônibus" : item === "Metro" ? "Metrô" : item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
