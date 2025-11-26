import { Icon, LucideIcon, Search, SlidersHorizontal } from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

interface InputBuscaProps {
    icon?: LucideIcon;
    placeholder?: string;
    className?: string;
}

export default function InputBusca(props: InputBuscaProps){ // deixei generico agr

    const colors = {
    customYellow: '#FFC107',
    customBlack: '#1E1E1E',
    customGray: '#F2F4F7',
    customDarkGray: '#808080ff',
    }

    return (
        <>
            <View className={`w-full ${props.className}`}>

                    <TextInput className="bg-white rounded-3xl h-12 w-full px-12 mr-12" 
                    placeholder={props.placeholder}/>

                    {props.icon &&  <props.icon color={colors.customDarkGray}
                    style={{position: 'absolute', left: 10, top: 10 }} />}
            </View>

        </>
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