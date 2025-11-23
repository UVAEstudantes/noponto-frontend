import { Search, SlidersHorizontal } from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

export default function CampoBuscarLinha1(){ // deixei como 1 pq vai ter outro campo de buscar linha na tela de linhas

    const colors = {
    customYellow: '#FFC107',
    customBlack: '#1E1E1E',
    customGray: '#F2F4F7',
    customDarkGray: '#808080ff',
    }

    const [filtroaberto, setFiltroAberto] = React.useState(false);

    function abrirFiltros(){
        setFiltroAberto(!filtroaberto);
        console.log("abrir filtros", !filtroaberto);
    }

    return (
        <View className=" absolute inset-x-5 top-12 m-5 ml-0 mr-18">

                <TextInput className="bg-white rounded-3xl h-12 w-full px-12 mr-12" 
                placeholder="Buscar Linhas"/>

                <Search  color={colors.customDarkGray}
                style={{position: 'absolute', left: 10, top: 10 }} />

                <Pressable onPress={abrirFiltros} className="bg-customBlack">
                    <SlidersHorizontal color={filtroaberto ? colors.customYellow : colors.customGray} size={24}
                    style={{position: 'absolute', right: -50, top: -30 }} />
                </Pressable>
        </View>
    );
}


/* // versão mais parecida com a do figma (eu não curti muito)
        <View className=" absolute inset-x-0 top-0 items-center z-10 bg-customBlack p-12">

                <TextInput className="bg-white top-4 rounded-3xl h-12 w-full px-12 mr-12 shadow-md" 
                placeholder="Buscar Linhas"/>

                <Search  color='#808080ff'
                style={{position: 'absolute', left: 30, top: 65 }} />

        </View>
        
*/