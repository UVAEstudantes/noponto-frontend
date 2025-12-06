import InputBusca from '@/src/components/inputBusca';
import { ArrowLeftRight, Bus, BusFront, ListFilter, LucideIcon, Train, TrainFrontTunnel } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView from 'react-native-maps';

const linhas = () => {

    /*
    
    tentar fazer um combo box personalizado q printa o modal select e muda a cor do pressable quando selecionado
    
    */

    const tipoModais = ["Ônibus", "BRT", "Trem", "Metrô" ];

    const [modal, setModal] = useState<String | null>("Ônibus");

    const [placeholder, setPlaceholder] = useState("Selecione um tipo de Transporte");
    const [icon, setIcon] = useState<LucideIcon>(ListFilter);

    useEffect(() => {
    if (modal === "Ônibus") {
        setPlaceholder("Buscar Linhas Ônibus");
        setIcon(BusFront);
    } 
    else if (modal === "BRT") {
        setPlaceholder("Buscar Linhas BRT");
        setIcon(Bus);
    }
    else if (modal === "Trem") {
        setPlaceholder("Buscar Ramal");
        setIcon(Train);
    }
    else if (modal === "Metrô") {
        setPlaceholder("Buscar Linhas Metrô");
        setIcon(TrainFrontTunnel);
    }
    }, [modal]);


    function clickModal(modalSelect: string){
        setModal(modalSelect);
        console.log("modal:", modalSelect);
    }


    return ( 

        <View className=" flex-1 justify-center items-center bg-white"> 
        
            <MapView 
                style={{ width: '100%', height: '100%', bottom: 90 }}

                mapType='standard' // tipo de mapa
                showsUserLocation= {true}
                followsUserLocation= {true}
                showsMyLocationButton= {false}

                customMapStyle={[ // remover os locais como lojas e coisas do tipo
                    {
                    featureType: "poi",
                    stylers: [{visibility: "off"}]
                    }
                ]}

                initialRegion={{
                    latitude: -22.512384145462976,
                    longitude: -43.22661972224441,
                    latitudeDelta: 0.2,
                    longitudeDelta: 0.2,
                }}
                        
            />

            <View className=" items-center rounded-3xl w-full h-full shadow-md bg-customGray bottom-[10rem]">
                <Text className="mt-7 text-2xl font-semibold">Linhas e Hórarios</Text>
                
                <View className='mt-8 flex-row justify-around w-[350px] px-1 bg-customLightGray py-2 rounded-xl'>

                    <Pressable onPress={() => clickModal(tipoModais[0])} 
                    className={`${modal === tipoModais[0] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Ônibus</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[1])} 
                    className={`${modal === tipoModais[1] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >BRT</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[2])} 
                    className={`${modal === tipoModais[2] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Trem</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[3])} 
                    className={`${modal === tipoModais[3] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Metrô</Text>
                    </Pressable>

                </View>

                {/*input busca linha*/}
                <View className='bg-customGray h-[100%] w-[500] mt-10 pt-5 '>

                    <InputBusca placeholder={placeholder} icon={icon} className='left-[5rem] !w-[72%]' />

                    <InputBusca placeholder="Selecionar Direção" icon={ArrowLeftRight} className='left-[5rem] !w-[72%] mt-7' />                    

                </View>
            </View>

        </View> 
    )
}

export default linhas;