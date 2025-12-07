import { ArrowLeftRight, ArrowRightLeft, Icon, LucideIcon} from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, TouchableOpacity, View, Text } from "react-native";

interface InputBuscaProps {
    //icon?: LucideIcon;
    placeholder?: string;
    className?: string;
}

export default function InputBusca(props: InputBuscaProps){

    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState<{ id: number; label: string } | null>(null);

    // essas opções são baseadas no q for escrito no input de busca, tem q pegar o destino e final da linha
    const options = [
        { id: 1, label: 'Opção 1'},
        { id: 2, label: 'Opção 2'}
    ];

    const colors = {
    customYellow: '#FFC107',
    customBlack: '#1E1E1E',
    customGray: '#F2F4F7',
    customDarkGray: '#808080ff',
    }

    const IconComponent = open ? ArrowLeftRight : ArrowRightLeft;

    return (

        <View className={`w-full ${props.className}`}>

            <Pressable className="bg-white rounded-3xl h-12 w-full px-12 mr-12 relative"
        
            onPress={() => { setOpen(!open); console.log("clicou"); }}>

            <IconComponent color={colors.customDarkGray} 
            style={{position: 'absolute', left: 10, top: 10 }} />

            <Text className="text-gray-500 top-3">{value ? value.label : props.placeholder}</Text>

            </Pressable>

            {open && (
                
                <View className="bg-white mt-2 rounded-2xl shadow-md max-h-40">

                    {options.map((option) => (
                        <Pressable key={option.id} 
                        onPress={() => { setValue(option); setOpen(false); }} 
                        className="p-4 border-b border-gray-200 active:bg-gray-100">
                            <Text>{option.label}</Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </View>
    );
}
