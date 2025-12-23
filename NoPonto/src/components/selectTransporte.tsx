import { useEffect, useRef, useState } from "react";
import { Pressable, View, Text, Animated } from "react-native";

interface Props {
  modal: String | null;
  setModal: (modal: string) => void;
  //className?: string;
}

export default function SelectTransporte(props: Props) {
  // animação ainda desalinhada, tentar capturar a posição do btn clicado pra calcular a posição do slider melhor

  const tipoModais = ["Onibus", "BRT", "Trem", "Metro"];

  //const [modal, setModal] = useState<String | null>("Ônibus");

  const animLeft = useRef(new Animated.Value(0)).current;

  const [containerWidth, setContainerWidth] = useState(0);
  const sliderWidth = 85;

  function clickModal(modalSelect: string, index: number) {
    props.setModal(modalSelect);

    const btnWidth = containerWidth / 4;
    let toPosition = index * btnWidth + (btnWidth - sliderWidth) / 2;

    if (index === 0) toPosition += 7;
    else if (index === 1) toPosition += 3;
    else if (index === 2) toPosition -= 3;
    else if (index === 3) toPosition -= 7;

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
          backgroundColor: "#FFC107",
          borderRadius: 10,
        }}
      />

      <Pressable
        onPress={() => clickModal(tipoModais[0], 0)}
        className={"px-6 py-3 rounded-xl"}
      >
        <Text>Ônibus</Text>
      </Pressable>

      <Pressable
        onPress={() => clickModal(tipoModais[1], 1)}
        className={"px-6 py-3 rounded-xl"}
      >
        <Text>BRT</Text>
      </Pressable>

      <Pressable
        onPress={() => clickModal(tipoModais[2], 2)}
        className={"px-6 py-3 rounded-xl"}
      >
        <Text>Trem</Text>
      </Pressable>

      <Pressable
        onPress={() => clickModal(tipoModais[3], 3)}
        className={"px-6 py-3 rounded-xl"}
      >
        <Text>Metrô</Text>
      </Pressable>
    </View>
  );
}
