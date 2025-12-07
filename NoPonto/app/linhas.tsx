import InputBusca from '@/src/components/inputBusca';
import Select from '@/src/components/select';
import SelectTransporte from '@/src/components/selectTransporte';
import { ArrowLeftRight, ArrowRightLeft, Bus, BusFront, ListFilter, LucideIcon, Train, TrainFrontTunnel } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView from 'react-native-maps';

const linhas = () => {

    const [modal] = useState<String | null>("Ônibus");
    const [placeholder, setPlaceholder] = useState("Selecione um tipo de Transporte");
    const [icon, setIcon] = useState<LucideIcon>(ListFilter);


    // mudar placeholder e icon do input de busca
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
                
                <SelectTransporte />

                {/*input busca linha*/}
                <View className='bg-customGray h-[100%] w-[500] mt-10 pt-5 '>

                    <InputBusca placeholder={placeholder} icon={icon} className='left-[5rem] !w-[72%] mb-7' />

                    <Select placeholder="Selecione o Sentido" className='left-[5rem] !w-[72%]'/>                    

                </View>
            </View>

        </View> 
    )
}

export default linhas;