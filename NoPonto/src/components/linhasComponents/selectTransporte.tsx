import { useEffect, useRef, useState, useCallback } from "react";
import { Pressable, View, Text, Animated } from "react-native";

interface Props {
  modal: string | null;
  setModal: (modal: string) => void;
}

export default function SelectTransporte(props: Props) {
  const tipoModais = ["Onibus", "BRT", "Trem", "Metro"];
  const animLeft = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const sliderWidth = 85;

  const getPos = useCallback((index: number, width: number) => {
    const btnWidth = width / 4;
    let toPosition = index * btnWidth + (btnWidth - sliderWidth) / 2;

    if (index === 0) toPosition += 7;
    else if (index === 1) toPosition += 3;
    else if (index === 2) toPosition -= 3;
    else if (index === 3) toPosition -= 7;
    
    return toPosition;
  }, [sliderWidth]);

  useEffect(() => {
    if (containerWidth > 0) {
      const initialIndex = tipoModais.indexOf(props.modal as string);
      const targetIndex = initialIndex !== -1 ? initialIndex : 0;
      const initialPos = getPos(targetIndex, containerWidth);

      animLeft.setValue(initialPos);
    }
  }, [containerWidth]);

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

      {tipoModais.map((item, index) => (
        <Pressable
          key={item}
          onPress={() => clickModal(item, index)}
          className={"px-6 py-3 rounded-xl"}
        >
          <Text>{item === "Onibus" ? "Ônibus" : item === "Metro" ? "Metrô" : item}</Text>
        </Pressable>
      ))}
    </View>
  );
}