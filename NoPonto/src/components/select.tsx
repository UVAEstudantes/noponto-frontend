import { ArrowLeftRight, ArrowRightLeft } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable, View, Text } from "react-native";

interface Props {
  //icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  options?: string[];
  value?: string | null;
  onChange?: (value: string) => void;
}

export default function InputBusca(props: Props) {
  const { cores } = useTema();
  const [open, setOpen] = React.useState(false);
  //const [value, setValue] = React.useState<{ id: number; label: string } | null>(null);

  // essas opções são baseadas no q for escrito no input de busca, tem q pegar o destino e final da linha

  const IconComponent = open ? ArrowLeftRight : ArrowRightLeft;

  return (
    <View className={`w-full ${props.className}`}>
      <Pressable
        className="bg-white rounded-3xl h-12 w-full px-12 mr-12 relative"
        style={{
          backgroundColor: cores.fundoInput,
          borderColor: cores.borda,
          borderWidth: 1,
        }}
        onPress={() => {
          setOpen(!open);
        }}
      >
        <IconComponent
          color={cores.iconeSecundario}
          style={{ position: "absolute", left: 10, top: 9 }}
        />

        <Text
          className="top-3"
          style={{
            color: props.value ? cores.textoPrimario : cores.textoSecundario,
          }}
        >
          {props.value ? props.value : props.placeholder}
        </Text>
      </Pressable>

      {open && (
        <View
          className="mt-2 rounded-2xl shadow-md max-h-40"
          style={{
            backgroundColor: cores.fundoCard,
            borderColor: cores.borda,
            borderWidth: 1,
          }}
        >
          {props.options?.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                props.onChange?.(option);
                setOpen(false);
              }}
              className="p-4"
              style={{
                borderBottomColor: cores.bordaSuave,
                borderBottomWidth: 1,
              }}
            >
              <Text style={{ color: cores.textoPrimario }}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
