import {
  ArrowLeftRight,
  ArrowRightLeft,
  Icon,
  LucideIcon,
} from "lucide-react-native";
import React from "react";
import {
  Pressable,
  TextInput,
  TouchableOpacity,
  View,
  Text,
} from "react-native";

interface Props {
  //icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  options?: string[];
  value?: string | null;
  onChange?: (value: string) => void;
}

export default function InputBusca(props: Props) {
  const [open, setOpen] = React.useState(false);
  //const [value, setValue] = React.useState<{ id: number; label: string } | null>(null);

  // essas opções são baseadas no q for escrito no input de busca, tem q pegar o destino e final da linha

  const colors = {
    customYellow: "#FFC107",
    customBlack: "#1E1E1E",
    customGray: "#F2F4F7",
    customDarkGray: "#808080ff",
  };

  const IconComponent = open ? ArrowLeftRight : ArrowRightLeft;

  return (
    <View className={`w-full ${props.className}`}>
      <Pressable
        className="bg-white rounded-3xl h-12 w-full px-12 mr-12 relative"
        onPress={() => {
          setOpen(!open);
        }}
      >
        <IconComponent
          color={colors.customDarkGray}
          style={{ position: "absolute", left: 10, top: 9 }}
        />

        <Text className="text-gray-500 top-3">
          {props.value ? props.value : props.placeholder}
        </Text>
      </Pressable>

      {open && (
        <View className="bg-white mt-2 rounded-2xl shadow-md max-h-40">
          {props.options?.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                props.onChange?.(option);
                setOpen(false);
              }}
              className="p-4 border-b border-gray-200 active:bg-gray-100"
            >
              <Text>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
