import { ArrowLeftRight, ArrowRightLeft } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable, View, Text } from "react-native";

interface Props {
  //icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  options?: (string | { label: string; value: string })[];
  value?: string | null;
  onChange?: (value: string) => void;
}

export default function InputBusca(props: Props) {
  const { cores } = useTema();
  const [open, setOpen] = React.useState(false);
  //const [value, setValue] = React.useState<{ id: number; label: string } | null>(null);

  // essas opções são baseadas no q for escrito no input de busca, tem q pegar o destino e final da linha

  const IconComponent = open ? ArrowLeftRight : ArrowRightLeft;
  const selectedOption = props.options?.find((option) =>
    (typeof option === "string" ? option : option.value) === props.value,
  );
  const selectedLabel = typeof selectedOption === "string"
    ? selectedOption
    : selectedOption?.label;

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
          {props.value ? (selectedLabel ?? props.value) : props.placeholder}
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
          {props.options?.map((option) => {
            const value = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? option : option.label;
            return (
            <Pressable
              key={value}
              onPress={() => {
                props.onChange?.(value);
                setOpen(false);
              }}
              className="p-4"
              style={{
                borderBottomColor: cores.bordaSuave,
                borderBottomWidth: 1,
              }}
            >
              <Text style={{ color: cores.textoPrimario }}>{label}</Text>
            </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
